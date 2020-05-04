import click
from kungfu.command import pass_ctx_from_parent
from kungfu.command.crypt import crypt
from kungfu.practice import make_expiry, encode_text


@crypt.command()
@click.option('-e', '--expiry', type=click.DateTime(), default=make_expiry(14), help='expiry date')
@click.option('-t', '--text', required=True, type=str, help="text to decode")
@click.pass_context
def encode(ctx, expiry, text):
    pass_ctx_from_parent(ctx)
    try:
        key_expiry, account_code = encode_text(ctx, expiry, text)
        click.echo(f"Key expires at {key_expiry}, account code expires at {expiry}")
        click.echo(account_code)
    except:
        click.echo("invalid key")
