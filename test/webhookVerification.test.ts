import handler from '../api/webhook/oura';

const createResponse = () => {
    const result = { statusCode: 0, body: null as Record<string, unknown> | null };
    const response = {
        status(code: number) {
            result.statusCode = code;
            return response;
        },
        setHeader() {
            return response;
        },
        send(raw: string) {
            result.body = JSON.parse(raw);
            return response;
        },
    };
    return { result, response };
};

describe('/api/webhook/oura verification', () => {
    beforeEach(() => {
        vi.stubEnv('OURA_MINI_PC_URL', '');
        vi.stubEnv('OURA_WEBHOOK_VERIFICATION_TOKEN', 'expected-token');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('echoes the challenge only for the configured verification token', async () => {
        const accepted = createResponse();
        await handler({ method: 'GET', query: { verification_token: 'expected-token', challenge: 'abc' } }, accepted.response);
        expect(accepted.result).toEqual({ statusCode: 200, body: { challenge: 'abc' } });

        for (const token of ['', 'expected-tokem', 'expected-token-longer']) {
            const rejected = createResponse();
            await handler({ method: 'GET', query: { verification_token: token, challenge: 'abc' } }, rejected.response);
            expect(rejected.result).toEqual({ statusCode: 401, body: { error: 'invalid_verification_token' } });
        }
    });
});
