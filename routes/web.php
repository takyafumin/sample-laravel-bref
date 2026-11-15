<?php

use App\Http\Controllers\MemoController;
use Illuminate\Support\Facades\Route;

Route::get('/', [MemoController::class, 'index'])->name('memos.index');
Route::post('/memos', [MemoController::class, 'store'])->name('memos.store');
Route::delete('/memos/{memo}', [MemoController::class, 'destroy'])->name('memos.destroy');
