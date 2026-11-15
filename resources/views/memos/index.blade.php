<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Memos - sample-laravel-bref</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #1f2328; }
        h1 { font-size: 1.4rem; }
        form.add { display: flex; gap: .5rem; margin-bottom: 1rem; }
        form.add input { flex: 1; padding: .5rem; }
        ul { list-style: none; padding: 0; }
        li { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem 0; border-bottom: 1px solid #d0d7de; }
        li small { color: #656d76; }
        .error { color: #cf222e; }
        dl.runtime { font-size: .8rem; color: #656d76; display: grid; grid-template-columns: auto 1fr; gap: 0 1rem; margin-top: 2rem; }
    </style>
</head>
<body>
    <h1>Memos</h1>

    <form class="add" method="POST" action="{{ route('memos.store') }}">
        @csrf
        <input name="body" value="{{ old('body') }}" placeholder="メモを入力" maxlength="1000" required autofocus>
        <button type="submit">追加</button>
    </form>
    @error('body')
        <p class="error">{{ $message }}</p>
    @enderror

    <ul>
        @forelse ($memos as $memo)
            <li>
                <span>{{ $memo->body }} <small>{{ $memo->created_at }}</small></span>
                <form method="POST" action="{{ route('memos.destroy', $memo) }}">
                    @csrf
                    @method('DELETE')
                    <button type="submit">削除</button>
                </form>
            </li>
        @empty
            <li><small>メモはまだありません</small></li>
        @endforelse
    </ul>

    <dl class="runtime">
        <dt>PHP</dt><dd>{{ $runtime['php'] }}</dd>
        <dt>Lambda</dt><dd>{{ $runtime['lambda'] ? 'yes' : 'no' }}</dd>
        <dt>SQLite</dt><dd>{{ $runtime['database'] }}</dd>
    </dl>
</body>
</html>
