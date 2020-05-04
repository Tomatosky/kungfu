import click
from kungfu.command import pass_ctx_from_parent
from kungfu.command.crypt import crypt
from kungfu.practice import encode_text


@crypt.command()
@click.option('-t', '--text', required=True, type=str, help="text to decode")
@click.pass_context
def encode(ctx, text):
    pass_ctx_from_parent(ctx)
    click.echo(encode_text(ctx, text))
