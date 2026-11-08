<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

/**
 * Serves the very same page as index.html, but hands the Supabase settings
 * to the browser from the server (no config.js needed) and adds security
 * headers. If the server has no settings, the page falls back to config.js.
 */
$html = @file_get_contents(__DIR__ . '/index.html');
if ($html === false) {
    http_response_code(500);
    exit('index.html is missing.');
}

$cfg = app_config();
if ($cfg['SUPABASE_URL'] !== '' && $cfg['SUPABASE_ANON_KEY'] !== '') {
    $json = json_encode($cfg, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
    $html = str_replace('<script src="config.js"></script>', '<script>window.APP_CONFIG=' . $json . ';</script>', $html);
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
echo $html;
