import { web3, TestContractParams, addressFromContractId } from '@alephium/web3'
import { randomContractId, testAddress } from '@alephium/web3-test'
import { DynamicRate, DynamicRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll, jest } from '@jest/globals'

jest.setTimeout(15000)

describe('calculateBorrowRate unit tests', () => {
    let testParamsFixture: TestContractParams<
        DynamicRateTypes.Fields,
        { id: string; market: any },
        DynamicRateTypes.Maps
    >
    let testContractAddress: string
    let linxAddress: string

    const MARKET_ID = '0000000000000000000000000000000000000000000000000000000000000001'

    beforeAll(async () => {
        web3.setCurrentNodeProvider('https://node.testnet.alephium.org', undefined, fetch)

        const contractId = randomContractId()
        testContractAddress = addressFromContractId(contractId)
        linxAddress = addressFromContractId(randomContractId())

        testParamsFixture = {
            address: testContractAddress,
            initialAsset: { alphAmount: 10n ** 18n },
            initialFields: { linx: linxAddress },
            inputAssets: [{ address: testAddress, asset: { alphAmount: 10n ** 18n } }],
            testArgs: { id: MARKET_ID, market: {} }, // will be overridden per-test
        }
    })

    function buildMarketState(
        totalSupplyAssets: bigint,
        totalBorrowAssets: bigint,
        lastUpdate: bigint = 0n
    ) {
        return {
            totalSupplyAssets,
            totalSupplyShares: totalSupplyAssets,
            totalBorrowAssets,
            totalBorrowShares: totalBorrowAssets,
            lastUpdate,
            fee: 0n,
        }
    }


    it('first interaction – 0 % utilisation (avg = initial/4, rateAtTarget initialised)', async () => {
        const market = buildMarketState(1n * 10n ** 18n, 0n)

        const testParams = {
            ...testParamsFixture,
            testArgs: { id: MARKET_ID, market },
        }

        const result = await DynamicRate.tests.calculateBorrowRate(testParams)
        const [avgRate, endRateAtTarget] = result.returns

        const INITIAL = DynamicRate.consts.INITIAL_RATE_AT_TARGET
        // Expect rateAtTarget to be initialised on first call.
        expect(endRateAtTarget).toEqual(INITIAL)
        // With CURVE_STEEPNESS = 4, the curve returns rate/4 when err = −1.
        expect(avgRate).toEqual(INITIAL / 4n)
    })

    it('first interaction – 100 % utilisation (avg = initial×4)', async () => {
        const market = buildMarketState(1n * 10n ** 18n, 1n * 10n ** 18n) // utilisation = 1

        const testParams = {
            ...testParamsFixture,
            testArgs: { id: MARKET_ID, market },
        }

        const result = await DynamicRate.tests.calculateBorrowRate(testParams)
        const [avgRate, endRateAtTarget] = result.returns

        const INITIAL = DynamicRate.consts.INITIAL_RATE_AT_TARGET
        expect(endRateAtTarget).toEqual(INITIAL)
        expect(avgRate).toEqual(INITIAL * 4n)
    })

    it('zero supply but positive borrow behaves like 0 % utilisation', async () => {
        const market = buildMarketState(0n, 10n ** 18n) // supply = 0, borrow = 1 token

        const testParams = {
            ...testParamsFixture,
            testArgs: { id: MARKET_ID, market },
        }

        const result = await DynamicRate.tests.calculateBorrowRate(testParams)
        const [avgRate, _] = result.returns

        const EXPECTED = DynamicRate.consts.INITIAL_RATE_AT_TARGET / 4n
        expect(avgRate).toEqual(EXPECTED)
    })

    it('subsequent interaction – utilisation at target leaves rate unchanged', async () => {
        // Pre-seed the rateAtTarget map with the initial value to mimic a previous update.
        const seededMaps: DynamicRateTypes.Maps = {
            rateAtTarget: new Map([[MARKET_ID, DynamicRate.consts.INITIAL_RATE_AT_TARGET]]),
        }

        // 90 % utilisation exactly equals TARGET_UTILIZATION (err = 0).
        const market = buildMarketState(100n * 10n ** 18n, 90n * 10n ** 18n)

        const testParams = {
            ...testParamsFixture,
            maps: seededMaps,
            testArgs: { id: MARKET_ID, market },
        }

        const result = await DynamicRate.tests.calculateBorrowRate(testParams)
        const [avgRate, endRateAtTarget] = result.returns

        const INITIAL = DynamicRate.consts.INITIAL_RATE_AT_TARGET
        expect(endRateAtTarget).toEqual(INITIAL)
        expect(avgRate).toEqual(INITIAL)
    })
}) 