
const API_BASE = '/api/sandbox';

export const backendService = {
    /**
     * Run MASM code via backend
     * @param {string} code - Assembly code
     * @param {string} input - Standard input
     * @param {boolean} interactive - Whether to run interactively in local window
     * @returns {Promise<{stdout: string, stderr: string, exit_code: number}>}
     */
    run: async (code, input = '', interactive = false) => {
        try {
            const response = await fetch(`${API_BASE}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code, input, interactive }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.stderr || 'Backend compilation failed');
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Backend run error:', error);
            throw error;
        }
    },

    /**
     * Get compiled executable binary (base64)
     * @param {string} code
     * @param {AbortSignal} [signal] - 可选，中断请求的 AbortSignal
     * @returns {Promise<{success: boolean, executable: string}>}
     */
    getExecutable: async (code, signal) => {
        try {
        const response = await fetch(`${API_BASE}/executable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
            signal,
        });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.stderr || 'Compilation failed');
            }
            return await response.json();
        } catch (error) {
            console.error('Get executable error:', error);
            throw error;
        }
    },

    /**
     * Check backend health
     */
    checkHealth: async () => {
        try {
            const response = await fetch(`${API_BASE}/compile`, { method: 'OPTIONS' });
            return response.ok;
        } catch (e) {
            return false;
        }
    }
};
