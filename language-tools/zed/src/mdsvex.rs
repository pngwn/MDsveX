use std::env;

use zed_extension_api::{
    self as zed,
    http_client::{HttpMethod, HttpRequest, RedirectPolicy},
    serde_json,
    settings::LspSettings,
    LanguageServerId, LanguageServerInstallationStatus, Result, Worktree,
};

const SERVER_PACKAGE: &str = "@mdsvex/language-server";
const SERVER_SCRIPT: &str = "node_modules/@mdsvex/language-server/dist/server.cjs";
const SERVER_ID: &str = "mdsvex-language-server";

// the latest tag is a placeholder, and zed version lookup reads only latest
const DIST_TAG: &str = "next";
const DIST_TAGS_URL: &str =
    "https://registry.npmjs.org/-/package/@mdsvex%2flanguage-server/dist-tags";

struct Mdsvex {
    checked_npm_this_session: bool,
}

fn tagged_version() -> Result<String> {
    // the builder has no default method and build fails without one
    let response = HttpRequest::builder()
        .method(HttpMethod::Get)
        .url(DIST_TAGS_URL)
        .redirect_policy(RedirectPolicy::FollowAll)
        .build()?
        .fetch()?;
    let tags: serde_json::Value =
        serde_json::from_slice(&response.body).map_err(|e| e.to_string())?;
    tags.get(DIST_TAG)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("{SERVER_PACKAGE} has no `{DIST_TAG}` tag"))
}

impl Mdsvex {
    fn install_server(&mut self, id: &LanguageServerId) -> Result<()> {
        let installed = zed::npm_package_installed_version(SERVER_PACKAGE)?;
        if self.checked_npm_this_session && installed.is_some() {
            return Ok(());
        }

        zed::set_language_server_installation_status(
            id,
            &LanguageServerInstallationStatus::CheckingForUpdate,
        );

        // on a failed lookup keep the installed server, or let npm resolve the tag
        let wanted = tagged_version()
            .unwrap_or_else(|_| installed.clone().unwrap_or_else(|| DIST_TAG.into()));

        if installed.as_deref() != Some(wanted.as_str()) {
            zed::set_language_server_installation_status(
                id,
                &LanguageServerInstallationStatus::Downloading,
            );
            if let Err(error) = zed::npm_install_package(SERVER_PACKAGE, &wanted) {
                if installed.is_none() {
                    return Err(error);
                }
            }
        }

        zed::set_language_server_installation_status(id, &LanguageServerInstallationStatus::None);
        self.checked_npm_this_session = true;
        Ok(())
    }
}

/// the project typescript, else the one npm installed beside the server as its peer
fn tsdk(worktree: &Worktree) -> Result<String> {
    if worktree
        .read_text_file("node_modules/typescript/package.json")
        .is_ok()
    {
        return Ok(format!(
            "{}/node_modules/typescript/lib",
            worktree.root_path()
        ));
    }
    Ok(env::current_dir()
        .map_err(|e| e.to_string())?
        .join("node_modules/typescript/lib")
        .to_string_lossy()
        .into_owned())
}

impl zed::Extension for Mdsvex {
    fn new() -> Self {
        Self {
            checked_npm_this_session: false,
        }
    }

    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<zed::Command> {
        // a binary path in the lsp settings runs a local build instead
        let binary = LspSettings::for_worktree(SERVER_ID, worktree)
            .ok()
            .and_then(|settings| settings.binary);
        if let Some(path) = binary.as_ref().and_then(|b| b.path.clone()) {
            let binary = binary.unwrap();
            return Ok(zed::Command {
                command: path,
                args: binary.arguments.unwrap_or_else(|| vec!["--stdio".into()]),
                env: binary.env.unwrap_or_default().into_iter().collect(),
            });
        }

        self.install_server(id)?;
        let script = env::current_dir()
            .map_err(|e| e.to_string())?
            .join(SERVER_SCRIPT)
            .to_string_lossy()
            .into_owned();

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![script, "--stdio".into()],
            env: Default::default(),
        })
    }

    fn language_server_initialization_options(
        &mut self,
        _id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<serde_json::Value>> {
        let mut options = LspSettings::for_worktree(SERVER_ID, worktree)
            .ok()
            .and_then(|settings| settings.initialization_options)
            .unwrap_or_else(|| serde_json::json!({}));

        // the server fails to start without typescript.tsdk
        let has_tsdk = options
            .pointer("/typescript/tsdk")
            .is_some_and(|v| v.is_string());
        if !has_tsdk {
            if let Some(object) = options.as_object_mut() {
                let typescript = object
                    .entry("typescript")
                    .or_insert_with(|| serde_json::json!({}));
                if let Some(typescript) = typescript.as_object_mut() {
                    typescript.insert("tsdk".into(), tsdk(worktree)?.into());
                }
            }
        }

        Ok(Some(options))
    }
}

zed::register_extension!(Mdsvex);
