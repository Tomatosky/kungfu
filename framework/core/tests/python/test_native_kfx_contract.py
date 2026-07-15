from kungfu.storage import service as storage_service


def test_native_kfx_python_binding_is_a_thin_core_edge(tmp_path):
    contract = storage_service.kfx_runtime_contract(tmp_path)
    assert contract["schema"] == "kungfu.kfx.native-contract/v1"
    assert contract["contractVersion"] == 1
    assert contract["authority"]["owner"] == "libkungfu"
    assert contract["sourceContractRoot"].startswith("sha256:")
    assert contract["nativeContractRoot"].startswith("sha256:")

    validated = storage_service.validate_kfx_runtime_document(
        "request",
        {
            "schema": "kungfu.kfx.native-request/v1",
            "contractVersion": 1,
            "operation": "inspect",
            "packagePath": "extensions/example",
            "requestedCapabilities": [],
        },
        tmp_path,
    )
    assert validated["valid"] is True
    assert validated["nativeContractRoot"] == contract["nativeContractRoot"]
