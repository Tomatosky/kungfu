import click
import sys
from Crypto.PublicKey import RSA
from PyInquirer import style_from_dict, Token, prompt
from kungfu.command import kfc, pass_ctx_from_parent
from kungfu.practice import write_key, KEY_PUB, KEY_PRI
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
@click.pass_context
def keygen(ctx):
    pass_ctx_from_parent(ctx)
    answers = prompt(questions, style=custom_style)
    hash_pass = yjj.hash_str_32(answers['password'])
    if hash_pass == 112094729:
        key = RSA.generate(2048)
        write_key(ctx, key.export_key(pkcs=8), KEY_PRI)
        write_key(ctx, key.publickey().export_key(pkcs=8), KEY_PUB)
        click.echo(f'Keys generated at {ctx.home}')
    else:
        click.echo('Invalid password!')
        sys.exit(-1)
