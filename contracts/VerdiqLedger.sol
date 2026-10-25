// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VerdiqLedger {
    struct BatchRecord {
        string batchId;
        bytes32 dataHash;
        uint256 timestamp;
        address submitter;
    }

    mapping(string => BatchRecord) public records;

    event BatchRegistered(string batchId, bytes32 dataHash, uint256 timestamp, address submitter);

    function registerBatch(string memory batchId, bytes32 dataHash) public {
        require(records[batchId].timestamp == 0, "Batch already registered");
        records[batchId] = BatchRecord(batchId, dataHash, block.timestamp, msg.sender);
        emit BatchRegistered(batchId, dataHash, block.timestamp, msg.sender);
    }

    function verifyBatch(string memory batchId, bytes32 dataHash) public view returns (bool) {
        return records[batchId].dataHash == dataHash;
    }

    function getRecord(string memory batchId) public view returns (string memory, bytes32, uint256, address) {
        BatchRecord memory r = records[batchId];
        return (r.batchId, r.dataHash, r.timestamp, r.submitter);
    }
}