import { createReducer } from 'redux-act'
import {
  assetsAdded,
  assetPriceUpdated, assetPricesUpdated,
  assetPriceError, assetPricesError,
} from 'Actions/asset'
import { createMergeByField, mapValues } from 'Utilities/helpers'
import { toBigNumber } from 'Utilities/convert'

const ZERO = toBigNumber(0)

const initialState = {}
const assetInitialState = {
  symbol: '',
  name: '',
  walletUrl: '',
  infoUrl: '',
  decimals: 0,
  deposit: false,
  receive: false,
  change24: ZERO,
  price: ZERO,
  change1: ZERO,
  change7d: ZERO,
  volume24: ZERO,
  marketCap: ZERO,
  availableSupply: ZERO,
  lastUpdatedPrice: null,
}

const mergeBySymbol = createMergeByField('symbol')

const priceDataToAsset = (priceData) => {
  const change24 = toBigNumber(priceData.percent_change_24h || 0)
  return {
    symbol: priceData.symbol,
    change24,
    change24decrease: change24.isNegative(),
    price: toBigNumber(priceData.price_usd || 0),
    change1: toBigNumber(priceData.percent_change_1h || 0),
    change7d: toBigNumber(priceData.percent_change_7d || 0),
    volume24: toBigNumber(priceData['24h_volume_usd'] || 0),
    marketCap: toBigNumber(priceData.market_cap_usd || 0),
    availableSupply: toBigNumber(priceData.available_supply || 0),
    lastUpdatedPrice: new Date(Number.parseInt(priceData.last_updated || '0') * 1000),
  }
}

export default createReducer({
  [assetsAdded]: (state, assets) => mergeBySymbol(state, ...assets.map((asset) => ({
    ...assetInitialState,
    ...asset,
    swapEnabled: asset.deposit && asset.receive
  }))),
  [assetPriceUpdated]: (state, priceData) => mergeBySymbol(state, priceDataToAsset(priceData)),
  [assetPricesUpdated]: (state, priceDataArray) => mergeBySymbol(state, ...priceDataArray.map((priceData) => priceDataToAsset(priceData))),
  [assetPriceError]: (state, { symbol, error }) => mergeBySymbol(state, { symbol, priceError: error }),
  [assetPricesError]: (state, error) => mapValues(state, (asset) => ({
    ...asset,
    priceError: error,
  }))
}, initialState)
