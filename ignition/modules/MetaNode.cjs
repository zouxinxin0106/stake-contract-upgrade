const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("MetaNodeTokenModule", (m) => {
  // 部署 MetaNodeToken 合约
  const MetaNodeToken = m.contract("MetaNodeToken");
  return { MetaNodeToken };
});
