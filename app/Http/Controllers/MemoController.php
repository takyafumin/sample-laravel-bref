<?php

namespace App\Http\Controllers;

use App\Models\Memo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class MemoController extends Controller
{
    public function index(): View
    {
        return view('memos.index', [
            'memos' => Memo::query()->latest('id')->get(),
            'runtime' => [
                'php' => PHP_VERSION,
                'lambda' => (bool) getenv('LAMBDA_TASK_ROOT'),
                'database' => config('database.connections.sqlite.database'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'body' => ['required', 'string', 'max:1000'],
        ]);

        Memo::create(['body' => $request->string('body')->toString()]);

        return redirect()->route('memos.index');
    }

    public function destroy(Memo $memo): RedirectResponse
    {
        $memo->delete();

        return redirect()->route('memos.index');
    }
}
