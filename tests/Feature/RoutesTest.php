<?php

namespace Tests\Feature;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RoutesTest extends TestCase
{
    public function test_only_expected_routes_are_exposed(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->map(fn (RoutingRoute $route): string => implode('|', $route->methods()).' '.$route->uri())
            ->sort()
            ->values()
            ->all();

        $this->assertSame([
            'DELETE memos/{memo}',
            'GET|HEAD /',
            'GET|HEAD up',
            'POST memos',
        ], $routes);
    }

    public function test_unused_routes_are_not_found(): void
    {
        $this->post('/signed-upload-url')->assertNotFound();
        $this->get('/storage/anything')->assertNotFound();
    }
}
