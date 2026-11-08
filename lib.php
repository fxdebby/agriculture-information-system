<?php
declare(strict_types=1);

/**
 * Reads the Supabase settings on the SERVER, so the keys never have to be
 * written into a file that is committed to GitHub.
 * Order: environment variables first, then config.local.php (not committed).
 */
function app_config(): array
{
    $url = (string) (getenv('SUPABASE_URL') ?: '');
    $key = (string) (getenv('SUPABASE_ANON_KEY') ?: '');
    $local = __DIR__ . '/config.local.php';
    if (($url === '' || $key === '') && is_file($local)) {
        $c = require $local;
        $url = $url !== '' ? $url : (string) ($c['SUPABASE_URL'] ?? '');
        $key = $key !== '' ? $key : (string) ($c['SUPABASE_ANON_KEY'] ?? '');
    }
    return ['SUPABASE_URL' => rtrim($url, '/'), 'SUPABASE_ANON_KEY' => $key];
}

/** Sends a small JSON reply and stops. */
function json_reply(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}
