<?php
declare(strict_types=1);
require __DIR__ . '/../lib.php';

/**
 * Exports one of the six reports as a CSV file (opens in Excel).
 *
 * The signed-in user's own Supabase token is passed through, so the database's
 * Row Level Security still decides what that user may see. The server never
 * uses a secret key.
 */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    json_reply(405, ['error' => 'Use POST.']);
}

$reports = [
    'farmers' => ['view' => 'v_farmers_farms', 'order' => 'farmer_name', 'date' => null, 'cols' => [
        'farmer_name' => 'Farmer', 'farmer_address' => 'Farmer address', 'farm_name' => 'Farm',
        'farm_city' => 'Farm city', 'area_hectares' => 'Area (ha)', 'irrigation_type' => 'Irrigation']],
    'crops' => ['view' => 'v_crops_per_farm', 'order' => 'farm_name', 'date' => 'last_planting_date', 'cols' => [
        'farm_name' => 'Farm', 'crop_name' => 'Crop', 'variety' => 'Variety', 'planting_count' => 'Plantings',
        'total_area_planted' => 'Area planted (ha)', 'last_planting_date' => 'Last planted']],
    'status' => ['view' => 'v_planting_details', 'order' => 'status_id', 'date' => 'planting_date', 'cols' => [
        'status' => 'Status', 'farm_name' => 'Farm', 'crop_name' => 'Crop', 'planting_date' => 'Planted',
        'expected_harvest_date' => 'Expected harvest', 'area_planted' => 'Area (ha)']],
    'harvest' => ['view' => 'v_harvest_details', 'order' => 'harvest_date', 'date' => 'harvest_date', 'cols' => [
        'harvest_date' => 'Date', 'farm_name' => 'Farm', 'crop_name' => 'Crop', 'quantity_kg' => 'Qty (kg)',
        'selling_price_per_kg' => 'Price per kg', 'quality_grade' => 'Grade', 'remarks' => 'Remarks']],
    'qty' => ['view' => 'v_harvest_details', 'order' => 'crop_name', 'date' => 'harvest_date', 'group' => true,
        'cols' => ['crop' => 'Crop', 'harvests' => 'Harvests', 'kg' => 'Total harvested (kg)']],
    'val' => ['view' => 'v_harvest_details', 'order' => 'crop_name', 'date' => 'harvest_date', 'group' => true,
        'cols' => ['crop' => 'Crop', 'kg' => 'Total (kg)', 'value' => 'Estimated value (PHP)']],
];

// ---- read and validate the request -------------------------------------
$in = json_decode((string) file_get_contents('php://input'), true);
$in = is_array($in) ? $in : [];
$key = (string) ($in['report'] ?? '');
if (!isset($reports[$key])) {
    json_reply(400, ['error' => 'Unknown report.']);
}
$r = $reports[$key];

$date = static function (mixed $v): ?string {
    $v = is_string($v) ? trim($v) : '';
    if ($v === '') return null;
    $d = DateTime::createFromFormat('Y-m-d', $v);
    return ($d && $d->format('Y-m-d') === $v) ? $v : '';
};
$from = $date($in['from'] ?? '');
$to = $date($in['to'] ?? '');
if ($from === '' || $to === '') {
    json_reply(400, ['error' => 'Dates must look like 2026-01-31.']);
}
if ($from !== null && $to !== null && $from > $to) {
    json_reply(400, ['error' => 'The From date must not be after the To date.']);
}

$token = (string) ($_SERVER['HTTP_X_USER_TOKEN'] ?? '');
if ($token === '' || strlen($token) > 4096 || !preg_match('/^[A-Za-z0-9._~+\/=-]+$/', $token)) {
    json_reply(401, ['error' => 'Please sign in again.']);
}

$cfg = app_config();
if ($cfg['SUPABASE_URL'] === '' || $cfg['SUPABASE_ANON_KEY'] === '') {
    json_reply(500, ['error' => 'The server is not configured yet.']);
}

// ---- ask Supabase, as the signed-in user -------------------------------
$q = ['select=*', 'order=' . $r['order'], 'limit=5000'];
if ($r['date'] && $from) $q[] = $r['date'] . '=gte.' . $from;
if ($r['date'] && $to) $q[] = $r['date'] . '=lte.' . $to;
$ch = curl_init($cfg['SUPABASE_URL'] . '/rest/v1/' . $r['view'] . '?' . implode('&', $q));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => ['apikey: ' . $cfg['SUPABASE_ANON_KEY'], 'Authorization: Bearer ' . $token, 'Accept: application/json'],
]);
$body = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($body === false) json_reply(502, ['error' => 'The database could not be reached.']);
if ($code === 401 || $code === 403) json_reply(401, ['error' => 'Please sign in again.']);
$rows = json_decode((string) $body, true);
if ($code !== 200 || !is_array($rows)) json_reply(502, ['error' => 'The report could not be created.']);

// ---- shape the rows like the on-screen report --------------------------
if (!empty($r['group'])) {
    $g = [];
    foreach ($rows as $x) {
        $n = (string) ($x['crop_name'] ?? '');
        $g[$n] ??= ['crop' => $n, 'harvests' => 0, 'kg' => 0.0, 'value' => 0.0];
        $g[$n]['harvests']++;
        $g[$n]['kg'] += (float) ($x['quantity_kg'] ?? 0);
        $g[$n]['value'] += (float) ($x['estimated_value'] ?? 0);
    }
    $rows = array_values($g);
    $rows[] = ['crop' => 'Total', 'harvests' => array_sum(array_column($rows, 'harvests')),
        'kg' => array_sum(array_column($rows, 'kg')), 'value' => array_sum(array_column($rows, 'value'))];
}

// ---- send the CSV ------------------------------------------------------
$safe = static function (mixed $v): string {
    if ($v === null) return '';
    if (is_float($v)) $v = rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.');
    $s = (string) $v;
    // stop spreadsheet programs from running typed text as a formula
    return (!is_numeric($s) && preg_match('/^[=+\-@\t\r]/', $s)) ? "'" . $s : $s;
};
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="ais-' . $key . '-' . date('Y-m-d') . '.csv"');
header('Cache-Control: no-store');
$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF"); // lets Excel read the file as UTF-8
fputcsv($out, array_values($r['cols']), ',', '"', '');
foreach ($rows as $row) {
    fputcsv($out, array_map(static fn($c) => $safe($row[$c] ?? null), array_keys($r['cols'])), ',', '"', '');
}
fclose($out);
