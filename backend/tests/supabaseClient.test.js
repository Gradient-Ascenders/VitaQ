describe('backend Supabase client', () => {
    const originalEnv = process.env;
    const createClient = jest.fn(() => ({ from: jest.fn() }));

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        createClient.mockClear();

        jest.doMock('@supabase/supabase-js', () => ({
            createClient,
        }));
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.dontMock('@supabase/supabase-js');
    });

    test('uses the service role key for backend database access', () => {
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
        process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';

        require('../src/lib/supabaseClient');

        expect(createClient).toHaveBeenCalledWith(
            'https://example.supabase.co',
            'service-role-key'
        );
    });

    test('fails fast when the service role key is missing', () => {
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';

        expect(() => require('../src/lib/supabaseClient')).toThrow(
            'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable'
        );
        expect(createClient).not.toHaveBeenCalled();
    });
});
