import { ContractsAPI, TokenAPI } from "src/apis";
import { CONTRACT_WRAPPER_ERRORS } from "src/wrappers/contract_wrappers/base_contract_wrapper";
import * as Web3 from "web3";
import { Web3Utils } from "utils/web3_utils";
import { DummyTokenContract, TokenTransferProxyContract } from "src/wrappers";
import { ACCOUNTS } from "../accounts";
import { BigNumber } from "bignumber.js";
import * as ABIDecoder from "abi-decoder";
import * as Units from "utils/units";
import * as compact from "lodash.compact";

const provider = new Web3.providers.HttpProvider("http://localhost:8545");
const web3 = new Web3(provider);
const web3Utils = new Web3Utils(web3);
const contractsApi = new ContractsAPI(web3);
const tokenApi = new TokenAPI(web3, contractsApi);

const TX_DEFAULTS = { from: ACCOUNTS[0].address, gas: 400000 };

const CONTRACT_OWNER = ACCOUNTS[0].address;

const SPENDER = ACCOUNTS[1].address;
const RECIPIENT = ACCOUNTS[2].address;
const OPERATOR = ACCOUNTS[3].address;

const TEST_ACCOUNTS = [SPENDER, RECIPIENT, OPERATOR];

const NON_CONTRACT_ADDRESS = ACCOUNTS[4].address;

const DEFAULT_STARTING_BALANCE = Units.ether(100);

describe("Token API (Integration Tests)", () => {
    let dummyREPToken: DummyTokenContract;
    let dummyZRXToken: DummyTokenContract;
    let dummyMKRToken: DummyTokenContract;

    let tokenTransferProxy: TokenTransferProxyContract;

    let currentNetworkId: number;
    let currentSnapshotId: number;

    beforeEach(async () => {
        currentSnapshotId = await web3Utils.saveTestSnapshot();

        const dummyTokenRegistry = await contractsApi.loadTokenRegistry();
        const dummyREPAddress = await dummyTokenRegistry.getTokenAddress.callAsync("REP");
        const dummyZRXAddress = await dummyTokenRegistry.getTokenAddress.callAsync("ZRX");
        const dummyMKRAddress = await dummyTokenRegistry.getTokenAddress.callAsync("MKR");

        dummyREPToken = await DummyTokenContract.at(dummyREPAddress, web3, TX_DEFAULTS);
        dummyZRXToken = await DummyTokenContract.at(dummyZRXAddress, web3, TX_DEFAULTS);
        dummyMKRToken = await DummyTokenContract.at(dummyMKRAddress, web3, TX_DEFAULTS);

        const dummyTokens = [dummyREPToken, dummyZRXToken, dummyMKRToken];

        for (let i = 0; i < TEST_ACCOUNTS.length; i++) {
            for (let j = 0; j < dummyTokens.length; j++) {
                const dummyToken = dummyTokens[j];

                await dummyToken.setBalance.sendTransactionAsync(
                    TEST_ACCOUNTS[i],
                    DEFAULT_STARTING_BALANCE,
                    { from: CONTRACT_OWNER },
                );
            }
        }

        tokenTransferProxy = await contractsApi.loadTokenTransferProxyAsync();

        ABIDecoder.addABI(dummyREPToken.abi);
    });

    afterEach(async () => {
        await web3Utils.revertToSnapshot(currentSnapshotId);
        ABIDecoder.removeABI(dummyREPToken.abi);
    });

    beforeAll(async () => {
        currentNetworkId = await web3Utils.getNetworkIdAsync();
    });

    describe("#transferAsync", () => {
        describe("no contract at token address", () => {
            test("should throw CONTRACT_NOT_FOUND_ON_NETWORK", async () => {
                await expect(
                    tokenApi.transferAsync(NON_CONTRACT_ADDRESS, RECIPIENT, new BigNumber(10), {
                        from: SPENDER,
                    }),
                ).rejects.toThrow(
                    CONTRACT_WRAPPER_ERRORS.CONTRACT_NOT_FOUND_ON_NETWORK(
                        "ERC20",
                        currentNetworkId,
                    ),
                );
            });
        });

        describe("contract exists at token address", () => {
            describe("sender transfers 10 tokens to recipient", () => {
                let txHash: string;
                let spenderBalanceBefore: BigNumber;
                let recipientBalanceBefore: BigNumber;

                beforeEach(async () => {
                    spenderBalanceBefore = await dummyREPToken.balanceOf.callAsync(SPENDER);
                    recipientBalanceBefore = await dummyREPToken.balanceOf.callAsync(RECIPIENT);

                    txHash = await tokenApi.transferAsync(
                        dummyREPToken.address,
                        RECIPIENT,
                        new BigNumber(10),
                        { from: SPENDER },
                    );
                });

                test("should emit log indicating transfer success", async () => {
                    const receipt = await web3Utils.getTransactionReceiptAsync(txHash);
                    const [transferLog] = compact(ABIDecoder.decodeLogs(receipt.logs));

                    expect(transferLog.name).toBe("Transfer");
                });

                test("should debit sender 10 tokens", async () => {
                    await expect(dummyREPToken.balanceOf.callAsync(SPENDER)).resolves.toEqual(
                        spenderBalanceBefore.minus(10),
                    );
                });

                test("should credit recipient 10 tokens", async () => {
                    await expect(dummyREPToken.balanceOf.callAsync(RECIPIENT)).resolves.toEqual(
                        recipientBalanceBefore.plus(10),
                    );
                });

                // TODO: Add fault tolerance to cases in which
                //  sender does not have sufficient balance, or in which
                //  contract does not implement ERC20 interface
            });
        });
    });

    describe("#transferFromAsync", () => {
        describe("no contract at token address", () => {
            test("should throw CONTRACT_NOT_FOUND_ON_NETWORK", async () => {
                await expect(
                    tokenApi.transferFromAsync(
                        NON_CONTRACT_ADDRESS,
                        SPENDER,
                        RECIPIENT,
                        new BigNumber(10),
                        { from: OPERATOR },
                    ),
                ).rejects.toThrow(
                    CONTRACT_WRAPPER_ERRORS.CONTRACT_NOT_FOUND_ON_NETWORK(
                        "ERC20",
                        currentNetworkId,
                    ),
                );
            });
        });

        describe("contract exists at token address", () => {
            describe("sender transfers 10 tokens to recipient", () => {
                let txHash: string;
                let spenderBalanceBefore: BigNumber;
                let recipientBalanceBefore: BigNumber;

                beforeEach(async () => {
                    spenderBalanceBefore = await dummyZRXToken.balanceOf.callAsync(SPENDER);
                    recipientBalanceBefore = await dummyZRXToken.balanceOf.callAsync(RECIPIENT);

                    await dummyZRXToken.approve.sendTransactionAsync(OPERATOR, new BigNumber(10), {
                        from: SPENDER,
                    });

                    txHash = await tokenApi.transferFromAsync(
                        dummyZRXToken.address,
                        SPENDER,
                        RECIPIENT,
                        new BigNumber(10),
                        { from: OPERATOR },
                    );
                });

                test("should emit log indicating transferFrom success", async () => {
                    const receipt = await web3Utils.getTransactionReceiptAsync(txHash);
                    const [transferLog] = compact(ABIDecoder.decodeLogs(receipt.logs));

                    expect(transferLog.name).toBe("Transfer");
                });

                test("should debit sender 10 tokens", async () => {
                    await expect(dummyZRXToken.balanceOf.callAsync(SPENDER)).resolves.toEqual(
                        spenderBalanceBefore.minus(10),
                    );
                });

                test("should credit recipient 10 tokens", async () => {
                    await expect(dummyZRXToken.balanceOf.callAsync(RECIPIENT)).resolves.toEqual(
                        recipientBalanceBefore.plus(10),
                    );
                });

                // TODO: Add fault tolerance to cases in which
                //  sender does not have sufficient balance, or in which
                //  contract does not implement ERC20 interface
            });
        });
    });

    describe("#getBalanceAsync", () => {
        describe("no contract at token address", () => {
            test("should throw CONTRACT_NOT_FOUND_ON_NETWORK", async () => {
                await expect(
                    tokenApi.getBalanceAsync(NON_CONTRACT_ADDRESS, SPENDER),
                ).rejects.toThrow(
                    CONTRACT_WRAPPER_ERRORS.CONTRACT_NOT_FOUND_ON_NETWORK(
                        "ERC20",
                        currentNetworkId,
                    ),
                );
            });
        });

        describe("contract exists at token address", () => {
            beforeEach(async () => {
                await dummyMKRToken.setBalance.sendTransactionAsync(SPENDER, Units.ether(99), {
                    from: CONTRACT_OWNER,
                });
                await dummyMKRToken.setBalance.sendTransactionAsync(RECIPIENT, Units.ether(70), {
                    from: CONTRACT_OWNER,
                });
                await dummyMKRToken.setBalance.sendTransactionAsync(OPERATOR, Units.ether(200), {
                    from: CONTRACT_OWNER,
                });
            });

            describe("Account #1", () => {
                test("should return correct balance for account", async () => {
                    await expect(
                        tokenApi.getBalanceAsync(dummyMKRToken.address, SPENDER),
                    ).resolves.toEqual(Units.ether(99));
                });
            });

            describe("Account #2", () => {
                test("should return correct balance for account", async () => {
                    await expect(
                        tokenApi.getBalanceAsync(dummyMKRToken.address, RECIPIENT),
                    ).resolves.toEqual(Units.ether(70));
                });
            });

            describe("Account #3", () => {
                test("should return correct balance for account", async () => {
                    await expect(
                        tokenApi.getBalanceAsync(dummyMKRToken.address, OPERATOR),
                    ).resolves.toEqual(Units.ether(200));
                });
            });

            // TODO: Add fault tolerance to cases in which
            //  contract does not implement ERC20 interface
        });
    });

    describe("#setProxyAllowanceAsync", () => {
        describe("no contract at token address", () => {
            test("should throw CONTRACT_NOT_FOUND_ON_NETWORK", async () => {
                await expect(
                    tokenApi.setProxyAllowanceAsync(NON_CONTRACT_ADDRESS, Units.ether(100)),
                ).rejects.toThrow(
                    CONTRACT_WRAPPER_ERRORS.CONTRACT_NOT_FOUND_ON_NETWORK(
                        "ERC20",
                        currentNetworkId,
                    ),
                );
            });
        });

        describe("contract exists at token address", () => {
            describe("sender is owner of account", () => {
                let txHash: string;

                beforeEach(async () => {
                    txHash = await tokenApi.setProxyAllowanceAsync(
                        dummyREPToken.address,
                        Units.ether(100),
                        { from: SPENDER },
                    );
                });

                test("should emit log indicating successful", async () => {
                    const receipt = await web3Utils.getTransactionReceiptAsync(txHash);
                    const [approveLog] = compact(ABIDecoder.decodeLogs(receipt.logs));

                    expect(approveLog.name).toBe("Approval");
                });

                test("should return specified allowance to proxy", async () => {
                    await expect(
                        dummyREPToken.allowance.callAsync(SPENDER, tokenTransferProxy.address),
                    ).resolves.toEqual(Units.ether(100));
                });

                // TODO: Add fault tolerance
            });
        });
    });

    describe("#setUnlimitedProxyAllowanceAsync", () => {
        describe("no contract at token address", () => {
            test("should throw CONTRACT_NOT_FOUND_ON_NETWORK", async () => {
                await expect(
                    tokenApi.setUnlimitedProxyAllowanceAsync(NON_CONTRACT_ADDRESS),
                ).rejects.toThrow(
                    CONTRACT_WRAPPER_ERRORS.CONTRACT_NOT_FOUND_ON_NETWORK(
                        "ERC20",
                        currentNetworkId,
                    ),
                );
            });
        });

        describe("contract exists at token address", () => {
            describe("sender is owner of account", () => {
                let txHash: string;

                beforeEach(async () => {
                    txHash = await tokenApi.setUnlimitedProxyAllowanceAsync(dummyZRXToken.address, {
                        from: RECIPIENT,
                    });
                });

                test("should emit log indicating successful", async () => {
                    const receipt = await web3Utils.getTransactionReceiptAsync(txHash);
                    const [approveLog] = compact(ABIDecoder.decodeLogs(receipt.logs));

                    expect(approveLog.name).toBe("Approval");
                });

                test("should return specified allowance to proxy", async () => {
                    const unlimitedAllowance = new BigNumber(2).pow(256).sub(1);

                    await expect(
                        dummyZRXToken.allowance.callAsync(RECIPIENT, tokenTransferProxy.address),
                    ).resolves.toEqual(unlimitedAllowance);
                });

                // TODO: Add fault tolerance
            });
        });
    });

    describe("#getProxyAllowanceAsync", () => {
        describe("no contract at token address", () => {
            test("should throw CONTRACT_NOT_FOUND_ON_NETWORK", async () => {
                await expect(
                    tokenApi.getProxyAllowanceAsync(NON_CONTRACT_ADDRESS, SPENDER),
                ).rejects.toThrow(
                    CONTRACT_WRAPPER_ERRORS.CONTRACT_NOT_FOUND_ON_NETWORK(
                        "ERC20",
                        currentNetworkId,
                    ),
                );
            });
        });

        describe("contract exists at token address", () => {
            beforeEach(async () => {
                await dummyMKRToken.approve.sendTransactionAsync(
                    tokenTransferProxy.address,
                    Units.ether(99),
                    { from: SPENDER },
                );
                await dummyMKRToken.approve.sendTransactionAsync(
                    tokenTransferProxy.address,
                    Units.ether(70),
                    { from: RECIPIENT },
                );
                await dummyMKRToken.approve.sendTransactionAsync(
                    tokenTransferProxy.address,
                    Units.ether(200),
                    { from: OPERATOR },
                );
            });

            describe("Account #1", () => {
                test("should return correct balance for account", async () => {
                    await expect(
                        tokenApi.getProxyAllowanceAsync(dummyMKRToken.address, SPENDER),
                    ).resolves.toEqual(Units.ether(99));
                });
            });

            describe("Account #2", () => {
                test("should return correct balance for account", async () => {
                    await expect(
                        tokenApi.getProxyAllowanceAsync(dummyMKRToken.address, RECIPIENT),
                    ).resolves.toEqual(Units.ether(70));
                });
            });

            describe("Account #3", () => {
                test("should return correct balance for account", async () => {
                    await expect(
                        tokenApi.getProxyAllowanceAsync(dummyMKRToken.address, OPERATOR),
                    ).resolves.toEqual(Units.ether(200));
                });
            });
        });
    });
});
