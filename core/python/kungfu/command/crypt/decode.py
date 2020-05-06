import click
from kungfu.command import pass_ctx_from_parent
from kungfu.command.crypt import crypt
from kungfu.practice import decode_text


@crypt.command()
@click.option('-t', '--text', required=True, type=str, help="text to decode")
@click.pass_context
def decode(ctx, text):
    pass_ctx_from_parent(ctx)
    try:
        expiry, dec_account_id = decode_text(ctx, text)
        click.echo(f"{dec_account_id} expires at {expiry}")
    except:
        click.echo("invalid key/code")
