import { web3, TestContractParams, addressFromContractId } from '@alephium/web3'
import { randomContractId, testAddress, expectAssertionError } from '@alephium/web3-test'
import { FixedRate, FixedRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'

describe('unit tests', () => {
    let testContractId: string
    let testContractAddress: string
    let testParamsFixture: TestContractParams<FixedRateTypes.Fields, { newBorrowRate: bigint }>

    // We initialize the fixture variables before all tests
    beforeAll(async () => {
        web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)
        testContractId = randomContractId()
        testContractAddress = addressFromContractId(testContractId)
        testParamsFixture = {
            // a random address that the test contract resides in the tests
            address: testContractAddress,
            // assets owned by the test contract before a test
            initialAsset: { alphAmount: 10n ** 18n },
            // initial state of the test contract
            initialFields: {
                admin: testAddress,
                rate: 100000000000000000n, // 0.1 * 10^18 = 10% in Wei format
                rateUpdated: false
            },
            // arguments to test the target function of the test contract
            testArgs: { newBorrowRate: 50000000000000000n }, // 0.05 * 10^18 = 5%
            // assets owned by the caller of the function
            inputAssets: [{ address: testAddress, asset: { alphAmount: 10n ** 18n } }]
        }
    })

    it('test getRate', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: {}
        }

        const testResult = await FixedRate.tests.getRate(testParams)

        // Check the return value
        expect(testResult.returns).toEqual(100000000000000000n)

        // Verify contract state remains unchanged
        const contractState = testResult.contracts[0] as FixedRateTypes.State
        expect(contractState.fields.rate).toEqual(100000000000000000n)
        expect(contractState.fields.rateUpdated).toEqual(false)
        expect(contractState.fields.admin).toEqual(testAddress)
    })

    it('test setBorrowRate success', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: { newBorrowRate: 50000000000000000n }
        }

        const testResult = await FixedRate.tests.setBorrowRate(testParams)

        // Check the return value
        expect(testResult.returns).toEqual(null)

        // Verify contract state was updated
        const contractState = testResult.contracts[0] as FixedRateTypes.State
        expect(contractState.fields.rate).toEqual(50000000000000000n)
        expect(contractState.fields.rateUpdated).toEqual(true)
        expect(contractState.fields.admin).toEqual(testAddress)

        // Verify a RateSet event was emitted
        expect(testResult.events.length).toEqual(1)
        const event = testResult.events[0] as FixedRateTypes.RateSetEvent
        expect(event.name).toEqual('RateSet')
        expect(event.fields.setter).toEqual(testAddress)
        expect(event.fields.oldRate).toEqual(100000000000000000n)
        expect(event.fields.newRate).toEqual(50000000000000000n)
    })

    it('test setBorrowRate fails when already updated', async () => {
        const testParams = {
            ...testParamsFixture,
            initialFields: {
                ...testParamsFixture.initialFields,
                rateUpdated: true
            },
            testArgs: { newBorrowRate: 50000000000000000n }
        }

        // Test that assertion fails with the RateAlreadySet error code (0)
        await expectAssertionError(
            FixedRate.tests.setBorrowRate(testParams),
            testContractAddress,
            0 // RateAlreadySet error code
        )
    })

    it('test setBorrowRate fails when rate is too high', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: { newBorrowRate: 2000000000000000000n } // 2.0 * 10^18 = 200% (too high)
        }

        // Test that assertion fails with the InvalidRate error code (1)
        await expectAssertionError(
            FixedRate.tests.setBorrowRate(testParams),
            testContractAddress,
            1 // InvalidRate error code
        )
    })

    it('test setBorrowRate fails when caller is not admin', async () => {
        const notAdmin = 'not-admin-address'
        const testParams = {
            ...testParamsFixture,
            inputAssets: [{ address: notAdmin, asset: { alphAmount: 10n ** 18n } }]
        }

        // Test that assertion fails with the NotAdmin error code (2)
        await expectAssertionError(
            FixedRate.tests.setBorrowRate(testParams),
            testContractAddress,
            2 // NotAdmin error code
        )
    })

    it('test borrowRate returns fixed rate regardless of market conditions', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: {
                marketParams: { lendingAmount: 1000000000000000000000n }, // 1000 * 10^18
                marketState: { totalLendingOffers: 2000000000000000000000n } // 2000 * 10^18
            }
        }

        const testResult = await FixedRate.tests.borrowRate(testParams)

        // Check that it returns the fixed rate regardless of market conditions
        expect(testResult.returns).toEqual(100000000000000000n)
    })
}) 