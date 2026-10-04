// mdsvex/highlight/languages, every twinkleplop language imported up front,
// for a host that can not await load_default_languages, such as an editor

import * as bash from '@twinkleplop/bash';
import * as c from '@twinkleplop/c';
import * as cpp from '@twinkleplop/cpp';
import * as css from '@twinkleplop/css';
import * as diff from '@twinkleplop/diff';
import * as dockerfile from '@twinkleplop/dockerfile';
import * as dotenv from '@twinkleplop/dotenv';
import * as go from '@twinkleplop/go';
import * as graphql from '@twinkleplop/graphql';
import * as html from '@twinkleplop/html';
import * as http from '@twinkleplop/http';
import * as ini from '@twinkleplop/ini';
import * as javascript from '@twinkleplop/javascript';
import * as json from '@twinkleplop/json';
import * as jsonc from '@twinkleplop/jsonc';
import * as markdown from '@twinkleplop/markdown';
import * as powershell from '@twinkleplop/powershell';
import * as python from '@twinkleplop/python';
import * as rust from '@twinkleplop/rust';
import * as shellsession from '@twinkleplop/shellsession';
import * as sql from '@twinkleplop/sql';
import * as svelte from '@twinkleplop/svelte';
import * as toml from '@twinkleplop/toml';
import * as tsx from '@twinkleplop/tsx';
import * as typescript from '@twinkleplop/typescript';
import * as yaml from '@twinkleplop/yaml';

import type { LanguageModule } from './highlight';

/** every twinkleplop language package by name */
export const default_languages: Record<string, LanguageModule> = {
	bash,
	c,
	cpp,
	css,
	diff,
	dockerfile,
	dotenv,
	go,
	graphql,
	html,
	http,
	ini,
	javascript,
	json,
	jsonc,
	markdown,
	powershell,
	python,
	rust,
	shellsession,
	sql,
	svelte,
	toml,
	tsx,
	typescript,
	yaml,
};
