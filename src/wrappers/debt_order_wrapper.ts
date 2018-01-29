import { BigNumber } from 'bignumber.js'
import { DebtOrder, IssuanceCommitment } from '../types'
import Web3Utils from 'web3-utils'

export class DebtOrderWrapper {
    private debtOrder: DebtOrder

    constructor(debtOrder: DebtOrder) {
        this.debtOrder = debtOrder
    }

    /**
     * Returns the subset of the debt order we refer to as the "Issuance Commitment".
     * See https://whitepaper.dharma.io/#debt-issuance-commitments
     *
     * @return Issuance commitment associated with this debt order
     */
    public getIssuanceCommitment(): IssuanceCommitment {
        return {
            issuanceVersion: this.debtOrder.issuanceVersion,
            debtor: this.debtOrder.debtor,
            underwriter: this.debtOrder.underwriter,
            underwriterRiskRating: this.debtOrder.underwriterRiskRating,
            termsContract: this.debtOrder.termsContract,
            termsContractParameters: this.debtOrder.termsContractParameters,
            salt: this.debtOrder.salt
        }
    }

    /**
     * Returns the hash of this debt order's "Issuance Commitment".
     * See https://whitepaper.dharma.io/#debt-issuance-commitments
     *
     * @return Hash of the issuance commitment associated with this debt order.
     */
    public getIssuanceCommitmentHash(): string {
        const issuanceCommitment = this.getIssuanceCommitment()
        return Web3Utils.soliditySha3(
            issuanceCommitment.issuanceVersion,
            issuanceCommitment.debtor,
            issuanceCommitment.underwriter,
            issuanceCommitment.underwriterRiskRating,
            issuanceCommitment.termsContract,
            issuanceCommitment.termsContractParameters,
            issuanceCommitment.salt
        )
    }

    /**
     * Returns the hash of the debt order in its entirety, in the order defined
     * in the Dharma whitepaper.
     * See https://whitepaper.dharma.io/#debtorcreditor-commitment-hash
     *
     * @return The debt order's hash
     */
    public getHash(): string {
        return Web3Utils.soliditySha3(
            this.debtOrder.kernelVersion,
            this.getIssuanceCommitmentHash(),
            this.debtOrder.principalAmount,
            this.debtOrder.principalToken,
            this.debtOrder.debtorFee,
            this.debtOrder.creditorFee,
            this.debtOrder.relayer,
            this.debtOrder.relayerFee,
            this.debtOrder.underwriterFee,
            this.debtOrder.expirationTimestampInSec
        )
    }

    /**
     * Returns the debt agreement's unique identifier --
     * an alias for the issuance commitment hash cast to a BigNumber
     *
     * @return Debt agreement id.
     */
    public getDebtAgreementId(): BigNumber {
        return new BigNumber(this.getHash())
    }

    /**
     * Returns the payload that a debtor must sign in order to
     * indicate her consent to the parameters of the debt order --
     * which is, currently, the debt order's hash.
     *
     * @return Debtor commitment hash
     */
    public getDebtorCommitmentHash(): string {
        return this.getHash()
    }

    /**
     * Returns the payload that a creditor must sign in order to
     * indicate her consent to the parameters of the debt order --
     * which is, currently, the debt order's hash.
     *
     * @return
     * creditor commitment hash
     */
    public getCreditorCommitmentHash(): string {
        return this.getHash()
    }

    /**
     * Returns the payload that an underwriter must sign in order to
     * indicate her consent to the parameters of the debt order, as
     * defined in the Dharma whitepaper.
     *
     * See https://whitepaper.dharma.io/#underwriter-commitment-hash
     *
     * @return Underwriter commitment hash
     */
    public getUnderwriterCommitmentHash(): string {
        return Web3Utils.soliditySha3(
            this.debtOrder.kernelVersion,
            this.getIssuanceCommitmentHash(),
            this.debtOrder.principalAmount,
            this.debtOrder.principalToken,
            this.debtOrder.underwriterFee,
            this.debtOrder.expirationTimestampInSec
        )
    }
}