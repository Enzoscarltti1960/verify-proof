import merkletree, { verifyProof } from 'merkletree'
import { createHash } from 'crypto'
import axios from 'axios'

import { endsWith, arrayBufferToBuffer } from './utils'

const getSha1 = (proof) => proof.extras.leaves[0].data

const guessDataUrl = (proof) => {
  const baseUrl = 'https://api.binded.com/v1'
  return `${baseUrl}/registrations/sha1/${getSha1(proof)}/download`
}

const bindedVerify = (_proof) => {
  const proof = _proof.proof ? _proof.proof : _proof
  const {
    header: {
      hash_type,
      merkle_root,
      tx_id,
      // timestamp,
    } = {},
    target: {
      target_hash,
      target_proof = [],
    } = {},
    extras = { leaves: [] },
  } = proof

  const dataUrl = extras.dataUrl ? extras.dataUrl : guessDataUrl(proof)

  const hashAlgorithm = (hash_type || 'sha256').replace('-', '').toLowerCase()

  // For backward compatibility datahash uses sha1 before sha-256
  const sha1 = (input) => createHash('sha1').update(input).digest('hex')
  const computeHash = (input) => createHash(hashAlgorithm).update(input).digest('hex')

  // Sync method to check if target hash is valid with respect to
  // extras.leaves
  const isTargetHashValid = () => {
    const leaves = extras.leaves.map((maybeLeaf) => {
      const leaf = typeof maybeLeaf === 'string'
        ? maybeLeaf
        : computeHash(maybeLeaf.data)
      return leaf
    })
    const tree = merkletree(leaves)
    const root = tree.root()
    return root === target_hash
  }

  // Sync method to check if merkle root is valid with respect
  // to target_proof
  const isMerkleRootValid = () => verifyProof(target_hash, merkle_root, target_proof)

  // Async method to verify if downloading dataUrl produces
  // expected hash
  const isDataHashValid = () => Promise.resolve()
    .then(() => axios({
      method: 'GET',
      url: dataUrl,
      responseType: 'arraybuffer',
    }))
    .then(arrayBufferToBuffer)
    .then((response) => {
      const { data } = response
      // first leaf is data hash by convention...
      const expectedDataHash = computeHash(getSha1(proof))
      // Due to backward compatibility we need to do a double hash
      const hash = computeHash(sha1(data))

      // console.log(hash)
      return hash === expectedDataHash
    })

  // Memoized getTx so we dont need to retrieve tx multiple times
  /*
  const getTxBlockrIo = (() => {
    let cachedTx
    return () => Promise.resolve().then(() => {
      if (cachedTx) return cachedTx
      // TODO: support more than one blockchain api
      const txUrl = `https://btc.blockr.io/api/v1/tx/info/${tx_id}`
      return axios.get(txUrl).then((response) => {
        cachedTx = response.data && response.data.data
        // console.log(cachedTx)
        return cachedTx
      })
    })
  })()
  */

  const blockchainInfoToBlockrFormat = (bcTx) => {
    const tx = bcTx
    tx.vouts = bcTx.out.map((vout) => ({
      ...vout,
      extras: {
        script: vout.script,
      },
    }))
    tx.confirmations = bcTx.block_height
    return tx
  }

  const getTx = (() => {
    let cachedTx
    return () => Promise.resolve().then(() => {
      if (cachedTx) return cachedTx
      // TODO: support more than one blockchain api
      const txUrl = `https://blockchain.info/rawtx/${tx_id}?cors=true`
      return axios.get(txUrl)
        .catch((err) => {
          // For some reason, blockchain.info returns 500 instead of 404 when
          // transaction not found.
          if (err.status === 500 && err.data.match(/Transaction not found/)) {
            err.status = 404
          }
          throw err
        })
        .then((response) => {
          cachedTx = blockchainInfoToBlockrFormat(response.data)
          // console.log(cachedTx)
          return cachedTx
        })
    })
  })()

  // Async method that checks if tx contains merkle root
  const isTxValid = () => getTx()
    .then(
      (tx) => {
        for (const output of tx.vouts) {
          if (!output.extras) continue
          const script = output.extras.script
          if (endsWith(script, merkle_root)) {
            return true
          }
        }
        return false
      },
      (err) => {
        if (err.status === 404) return false
        throw err
      }
    )

  // Async method that checks how many confirmations transaction
  // holding merkle root has
  const getConfirmations = () => getTx()
    .then(
      tx => tx.confirmations,
      (err) => {
        if (err.status === 404) return 0
        throw err
      }
    )

  // Combines method above to give detailed report about proof
  const analyze = () => Promise.resolve().then(() => {
    const tmp = {
      isTargetHashValid,
      isMerkleRootValid,
      isDataHashValid,
      isTxValid,
    }
    const validateKeys = Object.keys(tmp)
    const validateFns = Object.keys(tmp).map((key) => tmp[key])

    const validateTasks = validateFns.map(fn => fn())

    return Promise
      .all(validateTasks)
      .then(
        results => results.reduce(
          (acc, val, idx) => ({ ...acc, [validateKeys[idx]]: val }),
          {}
        )
      )
      .then((validations) => (
        getConfirmations().then((confirmations) => ({
          validations,
          confirmations,
        }))
      ))
      .then((results) => {
        const { validations } = results
        const isValid = Object.keys(validations).every((key) => validations[key])
        return {
          ...results,
          isValid,
        }
      })
  })

  return {
    isTargetHashValid,
    isMerkleRootValid,
    isDataHashValid,
    isTxValid,
    getConfirmations,
    analyze,
    dataUrl,
  }
}

export default bindedVerify
