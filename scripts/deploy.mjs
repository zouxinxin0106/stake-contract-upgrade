import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";

const connection = await hre.network.create();
const { ethers } = connection;
const upgradesApi = await upgrades(hre, connection);

const [signer] = await ethers.getSigners();

const MetaNodeToken = await ethers.getContractFactory("MetaNodeToken");
const metaNodeToken = await MetaNodeToken.deploy();

await metaNodeToken.waitForDeployment();
const metaNodeTokenAddress = await metaNodeToken.getAddress();

// 1. 获取合约工厂
const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");

// 2. 设置初始化参数
const startBlock = 1;
const endBlock = 999999999999;
const metaNodePerBlock = ethers.parseUnits("1", 18);

// 3. 部署可升级代理合约
const stake = await upgradesApi.deployProxy(
  MetaNodeStake,
  [metaNodeTokenAddress, startBlock, endBlock, metaNodePerBlock],
  { initializer: "initialize", kind: "uups" }
);

await stake.waitForDeployment();

const stakeAddress = await stake.getAddress();

// 获取实现合约地址（ERC1967 标准）
const implAddress = await upgradesApi.erc1967.getImplementationAddress(stakeAddress);
console.log("MetaNodeToken deployed to:", metaNodeTokenAddress);
console.log("MetaNodeStake (proxy) deployed to:", stakeAddress);
console.log("MetaNodeStake (implementation) deployed to:", implAddress);

// 将 MetaNode 代币转入质押合约
const tokenAmount = await metaNodeToken.balanceOf(signer.address);
let tx = await metaNodeToken.connect(signer).transfer(stakeAddress, tokenAmount);
await tx.wait();
console.log("Transferred", ethers.formatUnits(tokenAmount, 18), "MetaNode tokens to stake contract");

// 验证实现合约
console.log("\nVerifying implementation contract...");
try {
  await hre.run("verify", {
    address: implAddress,
    constructorArguments: [],
  });
  console.log("Implementation contract verified successfully!");
} catch (e) {
  if (e.message.includes("Already Verified")) {
    console.log("Implementation contract already verified.");
  } else {
    console.error("Verification failed:", e.message);
  }
}

// 验证 MetaNodeToken 合约
console.log("\nVerifying MetaNodeToken contract...");
try {
  await hre.run("verify", {
    address: metaNodeTokenAddress,
    constructorArguments: [],
  });
  console.log("MetaNodeToken contract verified successfully!");
} catch (e) {
  if (e.message.includes("Already Verified")) {
    console.log("MetaNodeToken contract already verified.");
  } else {
    console.error("Verification failed:", e.message);
  }
}
