/* The admin app is authored as plain html/css/js files (see worker/admin/)
   and imported as text modules — wrangler `rules` map these globs to Text,
   so they ship as strings with no extra build step and full editor support. */

import shell from "./admin/shell.html";
import styles from "./admin/styles.css";
import client from "./admin/client.txt";

export const ADMIN_HTML = shell;
export const ADMIN_CSS = styles;
export const ADMIN_JS = client;
