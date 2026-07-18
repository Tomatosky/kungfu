@echo off
rem SPDX-License-Identifier: Apache-2.0
call "%~dp0..\..\shifu.cmd" xinfa %*
exit /b %errorlevel%
