import click
import sys
from Crypto.PublicKey import RSA
from PyInquirer import style_from_dict, Token, prompt
from kungfu.command import kfc, pass_ctx_from_parent
from kungfu.practice import make_expiry, write_key, KEY_PUB, KEY_PRI
from kungfu.command.crypt import __all__
from pykungfu import yijinjing as yjj

questions = [
    {
        'type': 'password',
        'message': 'Enter password:',
        'name': 'password'
    }
]

custom_style = style_from_dict({
    Token.Separator: '#6C6C6C',
    Token.QuestionMark: '#FF9D00 bold',
    Token.Selected: '#5F819D',
    Token.Pointer: '#FF9D00 bold',
    Token.Instruction: '',  # default
    Token.Answer: '#5F819D bold',
    Token.Question: '',
})


@kfc.command(help_priority=-1)
@click.option('-e', '--expiry', type=click.DateTime(), default=make_expiry(365), help='expiry date')
@click.pass_context
def keygen(ctx, expiry):
    pass_ctx_from_parent(ctx)
    answers = prompt(questions, style=custom_style)
    hash_pass = yjj.hash_str_32(answers['password'])
    if hash_pass == 112094729:
        key = RSA.generate(2048)
        write_key(ctx, expiry, key.export_key(pkcs=8), KEY_PRI)
        write_key(ctx, expiry, key.publickey().export_key(pkcs=8), KEY_PUB)
        click.echo(f'Keys generated at {ctx.home}, expire at {expiry}')
    else:
        click.echo('Invalid password!')
        sys.exit(-1)
