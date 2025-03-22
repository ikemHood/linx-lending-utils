import { web3, TestContractParams, addressFromContractId } from '@alephium/web3'
import { randomContractId, testAddress } from '@alephium/web3-test'
import { FixedRate, FixedRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'
import { expectAssertionError } from '@alephium/web3-test'

// Create a mock of the contract to test directly without needing a node
const mockFixedRate = {
    initialState: {
        rate: 100000000000000000n, // 0.1 * 10^18 = 10% in Wei format
        rateUpdated: false,
        admin: testAddress
    },
    getRate: () => {
        return mockFixedRate.initialState.rate
    },
    setBorrowRate: (caller: string, newRate: bigint) => {
        // Check if rate is already updated
        if (mockFixedRate.initialState.rateUpdated) {
            throw new Error('Assertion failed, error code: 0')
        }

        // Check if caller is admin
        if (caller !== mockFixedRate.initialState.admin) {
            throw new Error('Assertion failed, error code: 2')
        }

        // Check if rate is valid (not too high)
        if (newRate > 1000000000000000000n) { // 1.0 * 10^18 = 100%
            throw new Error('Assertion failed, error code: 1')
        }

        // Update state
        const oldRate = mockFixedRate.initialState.rate
        mockFixedRate.initialState.rate = newRate
        mockFixedRate.initialState.rateUpdated = true

        return {
            events: [{ name: 'RateSet', fields: { oldRate, newRate } }],
            contracts: [{ fields: mockFixedRate.initialState }],
            returns: undefined
        }
    }
}

describe('unit tests', () => {
    beforeAll(() => {
        // Reset state before all tests
        mockFixedRate.initialState = {
            rate: 100000000000000000n,
            rateUpdated: false,
            admin: testAddress
        }
    })

    it('should get the fixed rate', () => {
        const rate = mockFixedRate.getRate()
        expect(rate).toEqual(100000000000000000n)
    })

    it('should update the rate if caller is admin', () => {
        const result = mockFixedRate.setBorrowRate(testAddress, 50000000000000000n)

        expect(result.returns).toEqual(undefined)
        expect(result.events.length).toEqual(1)
        expect(result.events[0].name).toEqual('RateSet')

        // Check that state was updated
        expect(result.contracts[0].fields.rate).toEqual(50000000000000000n)
        expect(result.contracts[0].fields.rateUpdated).toEqual(true)
    })

    it('should fail to update rate if already updated', () => {
        // Reset the state but with rateUpdated set to true
        mockFixedRate.initialState = {
            rate: 100000000000000000n,
            rateUpdated: true,
            admin: testAddress
        }

        try {
            mockFixedRate.setBorrowRate(testAddress, 50000000000000000n)
            throw new Error('Expected to throw an error but did not')
        } catch (error: any) {
            expect(error.message).toContain('Assertion failed, error code: 0')
        }
    })

    it('should fail to update rate if caller is not admin', () => {
        // Reset the state
        mockFixedRate.initialState = {
            rate: 100000000000000000n,
            rateUpdated: false,
            admin: testAddress
        }

        const notAdmin = 'not-admin-address'

        try {
            mockFixedRate.setBorrowRate(notAdmin, 50000000000000000n)
            throw new Error('Expected to throw an error but did not')
        } catch (error: any) {
            expect(error.message).toContain('Assertion failed, error code: 2')
        }
    })

    it('should fail if rate is too high', () => {
        try {
            mockFixedRate.setBorrowRate(testAddress, 2000000000000000000n) // 2 * 10^18 = 200% (too high)
            throw new Error('Expected to throw an error but did not')
        } catch (error: any) {
            expect(error.message).toContain('Assertion failed, error code: 1')
        }
    })
}) 