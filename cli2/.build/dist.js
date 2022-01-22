"use strict";

process.env.NODE_ENV = "production";
const { getEnvFile } = require("../../app/.electron-kungfu/utils");
getEnvFile();
const { say } = require("cfonts");
const chalk = require("chalk");
const webpack = require("webpack");
const Multispinner = require("multispinner");

const cliConfig = require("./webpack.cli.config");

const doneLog = chalk.bgGreen.white(" DONE ") + " ";
const errorLog = chalk.bgRed.white(" ERROR ") + " ";
const okayLog = chalk.bgBlue.white(" OKAY ") + " ";
const isCI = process.env.CI || false;

build();

function build() {
  greeting();

  const tasks = ["cli"];
  const m = new Multispinner(tasks, {
    preText: "building",
    postText: "process",
  });

  let results = "";

  m.on("success", () => {
    process.stdout.write("\x1B[2J\x1B[0f");
    console.log(`\n\n${results}`);
    console.log(`${okayLog}take it away ${chalk.yellow("`kungfu-trader`")}\n`);
    process.exit();
  });

  pack(cliConfig)
    .then((result) => {
      results += result + "\n\n";
      m.success("cli");
    })
    .catch((err) => {
      m.error("cli");
      console.log(`\n  ${errorLog}failed to build cli process`);
      console.error(`\n${err}\n`);
      process.exit(1);
    });
}

function pack(config) {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) reject(err.stack || err);
      else if (stats.hasErrors()) {
        let err = "";

        stats
          .toString({
            chunks: false,
            colors: true,
          })
          .split(/\r?\n/)
          .forEach((line) => {
            err += `    ${line}\n`;
          });

        reject(err);
      } else {
        resolve(
          stats.toString({
            chunks: false,
            colors: true,
          })
        );
      }
    });
  });
}

function greeting() {
  const cols = process.stdout.columns;
  let text = "";

  if (cols > 85) text = "kungfu-build";
  else if (cols > 60) text = "kungfu-|build";
  else text = false;

  if (text && !isCI) {
    say(text, {
      colors: ["yellow"],
      font: "simple3d",
      space: false,
    });
  } else console.log(chalk.yellow.bold("\n  kungfu-build"));
}
