<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';
// The app calls this to find out whether it is running on a PHP server.
json_reply(200, ['ok' => true, 'php' => PHP_VERSION]);
