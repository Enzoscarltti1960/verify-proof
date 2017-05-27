import test from 'blue-tape'
import bindedVerify from '../src'
import fs from 'fs'
import path from 'path'
import express from 'express'

const testDataPath = path.join(__dirname, 'data/')

// Load test data
const loadTestData = (name, baseUrl) => {
  const basePath = path.join(testDataPath, name)
  // const dataPath = path.join(basePath, 'file')
  const proofPath = path.join(basePath, 'proof.json')

  const proof = JSON.parse(fs.readFileSync(proofPath, { encoding: 'utf8' }))
  // const dataBuffer = fs.readFileSync(dataPath)
  proof.extras.dataUrl = `${baseUrl}/${name}/file`
  return {
    proof,
  }
}

const loadAllTestData = (baseUrl) => [
  'confirmed',
  'invalid',
  'text',
  'somewhatvalid',
  'emptybranch',
].reduce((acc, name) => ({
  ...acc,
  [name]: loadTestData(name, baseUrl),
}), {})

let testData
let httpServer
test('start http server to serve data/ files', (t) => {
  // start test server
  const app = express().use(express.static(testDataPath))
  httpServer = app.listen()
  const { port } = httpServer.address()
  const baseUrl = `http://localhost:${port}`
  testData = loadAllTestData(baseUrl)
  t.end()
})

test('empty branch', (t) => {
  t.plan(1)
  const emptybranch = bindedVerify(testData.emptybranch)
  emptybranch
    .analyze()
    .then((results) => {
      results.confirmations = 4097
      t.deepEqual(results, {
        validations: {
          isTargetHashValid: true,
          isMerkleRootValid: true,
          isDataHashValid: true,
          isTxValid: true,
        },
        confirmations: 4097,
        isValid: true,
      }, 'text')
    })
    .catch(t.fail)
})

test('isTargetHashValid', (t) => {
  const confirmed = bindedVerify(testData.confirmed)
  const invalid = bindedVerify(testData.invalid)
  t.ok(confirmed.isTargetHashValid(), 'target hash is valid')
  t.notOk(invalid.isTargetHashValid(), 'target hash is not valid')
  t.end()
})

test('isMerkleRootValid', (t) => {
  const confirmed = bindedVerify(testData.confirmed)
  const invalid = bindedVerify(testData.invalid)
  t.ok(confirmed.isMerkleRootValid(), 'merle root is valid')
  t.notOk(invalid.isMerkleRootValid(), 'merkle root is not valid')
  t.end()
})

test('isDataHashValid', (t) => {
  t.plan(3)
  const text = bindedVerify(testData.text)
  const confirmed = bindedVerify(testData.confirmed)
  const invalid = bindedVerify(testData.invalid)
  text.isDataHashValid().then((isValid) => t.ok(isValid)).catch(t.fail)
  confirmed.isDataHashValid().then((isValid) => t.ok(isValid)).catch(t.fail)
  invalid.isDataHashValid().then((isValid) => t.notOk(isValid)).catch(t.fail)
})

test('isTxValid', (t) => {
  t.plan(3)
  const text = bindedVerify(testData.text)
  const confirmed = bindedVerify(testData.confirmed)
  const invalid = bindedVerify(testData.invalid)
  text.isTxValid().then((isValid) => t.ok(isValid)).catch(t.fail)
  confirmed.isTxValid().then((isValid) => t.ok(isValid)).catch(t.fail)
  invalid.isTxValid().then((isValid) => t.notOk(isValid)).catch(t.fail)
})

test('getConfirmations', (t) => {
  t.plan(3)
  const text = bindedVerify(testData.text)
  const confirmed = bindedVerify(testData.confirmed)
  const invalid = bindedVerify(testData.invalid)
  // text.getConfirmations().then((confirms) => console.log(confirms)).catch(t.fail)
  text.getConfirmations().then((confirms) => t.ok(confirms > 100)).catch(t.fail)
  confirmed.getConfirmations().then((confirms) => t.ok(confirms > 100)).catch(t.fail)
  invalid.getConfirmations().then((confirms) => t.equal(confirms, 0)).catch(t.fail)
})

test('analyze', (t) => {
  t.plan(3)
  const text = bindedVerify(testData.text)
  const invalid = bindedVerify(testData.invalid)
  const somewhatvalid = bindedVerify(testData.somewhatvalid)
  text
    .analyze()
    .then((results) => {
      results.confirmations = 4097
      t.deepEqual(results, {
        validations: {
          isTargetHashValid: true,
          isMerkleRootValid: true,
          isDataHashValid: true,
          isTxValid: true,
        },
        confirmations: 4097,
        isValid: true,
      }, 'text')
    })
    .catch(t.fail)
  invalid
    .analyze()
    .then((results) => {
      t.deepEqual(results, {
        validations: {
          isTargetHashValid: false,
          isMerkleRootValid: false,
          isDataHashValid: false,
          isTxValid: false,
        },
        confirmations: 0,
        isValid: false,
      })
    }, 'invalid')
    .catch(t.fail)
  somewhatvalid
    .analyze()
    .then((results) => {
      results.confirmations = 4097
      t.deepEqual(results, {
        validations: {
          isTargetHashValid: true,
          isMerkleRootValid: false,
          isDataHashValid: true,
          isTxValid: false,
        },
        confirmations: 4097,
        isValid: false,
      }, 'somewhatvalid')
    })
    .catch(t.fail)
})

test.skip('infer data url and analyze for text', (t) => {
  // sete dataUrl to null
  const remoteProof = {
    proof: {
      ...testData.text.proof,
      extras: {
        ...testData.text.proof.extras,
        dataUrl: null,
      },
    },
  }
  const remote = bindedVerify(remoteProof)
  const expectedUrl = 'https://api.binded.com/v1/registrations/sha1/e206d0c8ab349cc4b708b443607379e63eba7762/download'
  t.equal(remote.dataUrl, expectedUrl)
  remote
    .analyze()
    .then((results) => {
      results.confirmations = 4097
      t.deepEqual(results, {
        validations: {
          isTargetHashValid: true,
          isMerkleRootValid: true,
          isDataHashValid: true,
          isTxValid: true,
        },
        confirmations: 4097,
        isValid: true,
      }, 'remote')
      t.end()
    })
    .catch((err) => {
      // console.error(err)
      t.fail(err.message)
    })
})

test('infer data url and analyze', (t) => {
  // sete dataUrl to null
  const remoteProof = {
    proof: {
      ...testData.confirmed.proof,
      extras: {
        ...testData.confirmed.proof.extras,
        dataUrl: null,
      },
    },
  }
  const remote = bindedVerify(remoteProof)
  const expectedUrl = 'https://api.binded.com/v1/registrations/sha1/9017d9ef115f342115c33b26a82c120ffa0dd68c/download'
  t.equal(remote.dataUrl, expectedUrl)
  remote
    .analyze()
    .then((results) => {
      results.confirmations = 4097
      t.deepEqual(results, {
        validations: {
          isTargetHashValid: true,
          isMerkleRootValid: true,
          isDataHashValid: true,
          isTxValid: true,
        },
        confirmations: 4097,
        isValid: true,
      }, 'remote')
      t.end()
    })
    .catch(t.fail)
})

test('close http server', (t) => {
  httpServer.close()
  t.end()
})
