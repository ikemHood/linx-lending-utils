import { web3, DUST_AMOUNT } from '@alephium/web3'
import { testNodeWallet } from '@alephium/web3-test'
import { deployToDevnet } from '@alephium/cli'
import { DynamicRate } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'

describe('dynamic rate integration tests', () => {
    beforeAll(async () => {
        web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)
    })

    it('should test dynamic rate functions on devnet', async () => {
        const signer = await testNodeWallet()
        const deployments = await deployToDevnet()

        // Test with all of the addresses of the wallet
        for (const account of await signer.getAccounts()) {
            const testAddress = account.address
            await signer.setSelectedAccount(testAddress)
            const testGroup = account.group

            const dynamicRate = deployments.getInstance(DynamicRate, testGroup)
            if (dynamicRate === undefined) {
                console.log(`The contract is not deployed on group ${account.group}`)
                continue
            }

            expect(dynamicRate.groupIndex).toEqual(testGroup)
            const initialState = await dynamicRate.fetchState()

            // Test transfer admin 
            const newAdmin = testAddress // Using same address for simplicity
            await dynamicRate.transact.transferAdmin({
                signer: signer,
                attoAlphAmount: DUST_AMOUNT * 3n,
                args: { newAdmin }
            })

            // Verify admin was updated
            const updatedState = await dynamicRate.fetchState()
            expect(updatedState.fields.admin).toEqual(newAdmin)

            // Test borrowRate and borrowRateView with mock market data
            const marketParams = {
                loanToken: testAddress,
                collateralToken: testAddress,
                oracle: testAddress
            }

            const marketState = {
                totalSupplyAssets: 100n * 10n ** 18n,
                totalSupplyShares: 100n * 10n ** 18n,
                totalBorrowAssets: 50n * 10n ** 18n,
                totalBorrowShares: 50n * 10n ** 18n,
                lastUpdate: 1000n,
                fee: 0n
            }

            const rateAtTarget = await dynamicRate.view.getRateAtTarget({
                args: { loanToken: testAddress, collateralToken: testAddress }
            })
            expect(rateAtTarget.returns).toEqual(0n)

            console.log('rateAtTarget: ', rateAtTarget)

            // Call the view function 
            const viewResult = await dynamicRate.view.borrowRate({
                args: { marketParams, marketState }
            })
            console.log("viewResult: ", viewResult)

            // Verify view function returns a valid rate
            // The result is a CallContractResult object with returns property
            expect(viewResult.returns > 0n).toBeTruthy()

            // Test borrowRate with high utilization
            const borrowRate = await dynamicRate.transact.getBorrowRateAndUpdate({
                signer: signer,
                attoAlphAmount: DUST_AMOUNT * 100n,
                args: { marketParams, marketState }
            })
            console.log("borrowRate: ", borrowRate)

            // Verify borrowRate was updated
            const newRateAtTarget = await dynamicRate.view.getRateAtTarget({
                args: { loanToken: marketParams.loanToken, collateralToken: marketParams.collateralToken }
            })
            console.log("newRateAtTarget: ", newRateAtTarget)
            expect(newRateAtTarget.returns).toBeGreaterThan(rateAtTarget.returns)
        }
    }, 20000)
}) 