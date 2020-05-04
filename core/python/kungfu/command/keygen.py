import click
from Crypto.PublicKey import RSA
from kungfu.command import kfc, pass_ctx_from_parent
from kungfu.practice import write_key, KEY_PUB, KEY_PRI


@kfc.command(help_priority=-1)
@click.pass_context
def keygen(ctx):
    pass_ctx_from_parent(ctx)
    key = RSA.generate(2048)
    write_key(ctx, key.export_key(pkcs=8), KEY_PRI)
    write_key(ctx, key.publickey().export_key(pkcs=8), KEY_PUB)
