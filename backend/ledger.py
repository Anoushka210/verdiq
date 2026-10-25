import hashlib
import time
import uuid

ledger_store = {}

def hash_data(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def register_batch(batch_id: str, data_hash: str) -> dict:
    if batch_id in ledger_store:
        raise ValueError("Batch already registered")
    
    fake_tx_hash = "0x" + hashlib.sha256(f"{batch_id}{time.time()}".encode()).hexdigest()
    
    record = {
        "batch_id": batch_id,
        "data_hash": data_hash,
        "timestamp": time.time(),
        "tx_hash": fake_tx_hash,
        "submitter": "0xefbfc314af151192486b6785bce6cd063f135d4b"
    }
    ledger_store[batch_id] = record
    return record

def verify_batch(batch_id: str, data_hash: str) -> dict:
    if batch_id not in ledger_store:
        return {"verified": False, "reason": "Batch not found in ledger"}
    
    record = ledger_store[batch_id]
    match = record["data_hash"] == data_hash
    return {
        "verified": match,
        "registered_hash": record["data_hash"],
        "submitted_hash": data_hash,
        "tx_hash": record["tx_hash"],
        "timestamp": record["timestamp"],
        "reason": "Hash match" if match else "Hash mismatch — data may have been altered"
    }

def get_record(batch_id: str) -> dict:
    if batch_id not in ledger_store:
        return None
    return ledger_store[batch_id]