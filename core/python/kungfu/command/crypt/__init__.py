import click
from kungfu.command import kfc, pass_ctx_from_parent as pass_ctx_from_root


@kfc.group(help_priority=-1)
@click.help_option('-h', '--help')
@click.pass_context
def crypt(ctx):
    pass_ctx_from_root(ctx)


def pass_ctx_from_parent(ctx):
    pass_ctx_from_root(ctx)
