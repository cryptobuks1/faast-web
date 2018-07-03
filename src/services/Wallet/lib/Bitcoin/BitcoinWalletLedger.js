import HDKey from 'hdkey'

import config from 'Config'
import log from 'Utilities/log'
import { xpubToYpub, joinDerivationPath } from 'Utilities/bitcoin'
import { toMainDenomination, toSmallestDenomination } from 'Utilities/convert'
import Ledger from 'Services/Ledger'

import BitcoinWallet from './BitcoinWallet'

const typeLabel = config.walletTypes.ledger.name

const DEFAULT_FEE = 10 // Sat/byte

export default class BitcoinWalletLedger extends BitcoinWallet {

  static type = 'BitcoinWalletLedger';

  constructor(xpub, derivationPath, label) {
    super(xpub, label)
    this.derivationPath = derivationPath
  }

  getType() { return BitcoinWalletLedger.type }

  getTypeLabel() { return typeLabel }

  isLegacyAccount() { return this.derivationPath.startsWith('m/44') }

  getAccountNumber() { return Number.parseInt(this.derivationPath.match(/(\d+)'$/)[1]) + 1 }

  getLabel() { return this.label || `Bitcoin${this.isLegacyAccount() ? 'legacy ' : ''} account #${this.getAccountNumber()}` }

  static fromPath(derivationPath) {
    return Ledger.btc.getWalletPublicKey(derivationPath)
      .then(({ publicKey, chainCode }) => {
        log.info('Ledger.btc.getWalletPublicKey success')
        const hdKey = new HDKey()
        hdKey.publicKey = Buffer.from(publicKey, 'hex')
        hdKey.chainCode = Buffer.from(chainCode, 'hex')
        let xpubkey = hdKey.publicExtendedKey
        if (derivationPath.startsWith('m/49\'')) {
          xpubkey = xpubToYpub(xpubkey)
          log.info('Converted segwit xpub to ypub')
        }
        return new BitcoinWalletLedger(xpubkey, derivationPath)
      })
  }

  _canSendAsset() { return true }

  isReadOnly() { return false }

  _createTransaction(toAddress, amount, asset, options = {}) {
    return this._getDiscoveryResult().then((discoverResult) => {
      const feeRate = options.feeRate || DEFAULT_FEE
      const isSegwit = !this.isLegacyAccount()
      return this.bitcore.buildPaymentTx(discoverResult, toAddress, toSmallestDenomination(amount, asset.decimals), feeRate, isSegwit)
    })
    .then((txData) => {
      return {
        feeAmount: toMainDenomination(txData.fee, asset.decimals),
        feeSymbol: 'BTC',
        txData,
      }
    })
  }

  /**
  * Sign a transaction using ledgerjs api
  */
  _signTx(tx) {
    const { txData } = tx
    return Promise.all(txData.inputUtxos.map((utxo) =>
      this.bitcore.lookupTransaction(utxo.transactionHash)
        .then((txInfo) => Ledger.btc.splitTransaction(txInfo.hex, true, false))
        .then((splitTx) => ({
          ...utxo,
          splitTx
        }))))
      .then((inputUtxos) => {
        log.info('inputUtxos', inputUtxos)

        const inputs = []
        const paths = []
        inputUtxos.forEach((utxo) => {
          inputs.push([utxo.splitTx, utxo.index])
          paths.push(joinDerivationPath(this.derivationPath, utxo.addressPath))
        })

        const changePath = joinDerivationPath(this.derivationPath, txData.changePath)
        return Ledger.btc.createPaymentTransactionNew(
          inputs,
          paths,
          changePath,
          txData.outputScript,
          undefined, // lockTime, default (0)
          undefined, // sigHashType, default (all)
          txData.isSegwit)
      })
      .then((signedTxHex) => ({
        signedTxData: signedTxHex
      }))
  }

  _validateTxData(txData) {
    if (txData === null || typeof txData === 'object') {
      throw new Error(`Invalid ${this.getType()} txData of type ${typeof txData}`)
    }
    return txData
  }
}