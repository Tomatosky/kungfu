import base64
import os
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA


KEY_PUB = "admin.key"
KEY_PRI = "kungfu.key"


def write_key(ctx, key, file):
    cipher = AES.new(bytearray(list(range(16))), AES.MODE_EAX)
    cipher_text, tag = cipher.encrypt_and_digest(key)
    with open(os.path.join(ctx.home, file), "wb") as file_out:
        [file_out.write(x) for x in (cipher.nonce, tag, cipher_text)]


def read_key(ctx, file):
    with open(os.path.join(ctx.home, file), "rb") as file_in:
        nonce, tag, cipher_text = [file_in.read(x) for x in (16, 16, -1)]
        cipher = AES.new(bytearray(list(range(16))), AES.MODE_EAX, nonce)
        data = cipher.decrypt_and_verify(cipher_text, tag)
    return data


def encode_text(ctx, text):
    private_key = RSA.import_key(read_key(ctx, KEY_PUB))
    account_id = text.encode()
    cipher_rsa = PKCS1_OAEP.new(private_key, randfunc=lambda n: bytearray(list(range(n))))
    enc_account_id = cipher_rsa.encrypt(account_id)
    return base64.encodebytes(enc_account_id).decode().replace("\n", "")


def decode_text(ctx, text):
    try:
        public_key = RSA.import_key(read_key(ctx, KEY_PRI))
        cipher_rsa = PKCS1_OAEP.new(public_key)
        enc_account_id = base64.decodebytes(text.encode())
        return cipher_rsa.decrypt(enc_account_id).decode()
    except:
        return text
