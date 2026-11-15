<?php

namespace Tests\Feature;

use App\Models\Memo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MemoTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_lists_memos(): void
    {
        Memo::create(['body' => 'hello bref']);

        $this->get('/')->assertOk()->assertSee('hello bref');
    }

    public function test_store_creates_memo(): void
    {
        $this->post('/memos', ['body' => 'new memo'])->assertRedirect('/');

        $this->assertDatabaseHas('memos', ['body' => 'new memo']);
    }

    public function test_store_requires_body(): void
    {
        $this->post('/memos', ['body' => ''])->assertSessionHasErrors('body');

        $this->assertDatabaseCount('memos', 0);
    }

    public function test_destroy_deletes_memo(): void
    {
        $memo = Memo::create(['body' => 'to delete']);

        $this->delete("/memos/{$memo->id}")->assertRedirect('/');

        $this->assertDatabaseMissing('memos', ['id' => $memo->id]);
    }
}
