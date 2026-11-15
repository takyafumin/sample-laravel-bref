<?php

// Overrides for bref/laravel-bridge (defaults: vendor/bref/laravel-bridge/config/bref.php).
// The package config is merged shallowly: each top-level key set here (e.g. `uploads`)
// replaces the package default as a whole; other top-level keys keep their defaults.

return [

    // This app has no file uploads and no S3 disk: disable the presigned
    // upload route (POST /signed-upload-url).
    'uploads' => [
        'route' => null,
    ],

];
