import base64
import os
from datetime import datetime, timedelta
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA

KEY_PUB = "admin.key"
KEY_PRI = "kungfu.key"


def make_expiry(days):
    return datetime.strftime(datetime.now() + timedelta(days=days), '%Y-%m-%d')


def encode_expiry(expiry):
    expiry_ms = int(expiry.timestamp()) * 1000
    return expiry_ms.to_bytes(8, byteorder='big')


def decode_expiry(data):
    return datetime.fromtimestamp(float(int.from_bytes(data[0:8], byteorder='big', signed=True) / 1000))


def write_key(ctx, expiry, key, file):
    cipher = AES.new(bytearray(list(range(16))), AES.MODE_EAX)
    cipher_text, tag = cipher.encrypt_and_digest(encode_expiry(expiry) + key)
    with open(os.path.join(ctx.home, file), "wb") as file_out:
        [file_out.write(x) for x in (cipher.nonce, tag, cipher_text)]


def read_key(ctx, file):
    with open(os.path.join(ctx.home, file), "rb") as file_in:
        nonce, tag, cipher_text = [file_in.read(x) for x in (16, 16, -1)]
        cipher = AES.new(bytearray(list(range(16))), AES.MODE_EAX, nonce)
        data = cipher.decrypt_and_verify(cipher_text, tag)
    return data


def encode_text(ctx, expiry, text):
    key_data = read_key(ctx, KEY_PUB)
    key_expiry = decode_expiry(key_data)
    if datetime.now() < key_expiry:
        private_key = RSA.import_key(key_data[8:])
        account_id = text.encode()
        cipher_rsa = PKCS1_OAEP.new(private_key, randfunc=lambda n: bytearray(list(range(n))))
        enc_data = cipher_rsa.encrypt(encode_expiry(expiry) + account_id)
        return key_expiry, base64.encodebytes(enc_data).decode().replace("\n", "")
    raise OverflowError("Key expired")


def decode_text(ctx, text):
    key_data = read_key(ctx, KEY_PRI)
    key_expiry = decode_expiry(key_data)
    if datetime.now() < key_expiry:
        public_key = RSA.import_key(key_data[8:])
        cipher_rsa = PKCS1_OAEP.new(public_key)
        code_data = cipher_rsa.decrypt(base64.decodebytes(text.encode()))
        enc_account_id = code_data[8:]
        code_expiry = decode_expiry(code_data)
        if datetime.now() < code_expiry:
            return code_expiry, enc_account_id.decode()
    raise OverflowError("Key expired")
