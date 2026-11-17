import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface ScheduleAdviceRequestBody {
  po?: {
    poNumber?: string;
    supplierName?: string;
    targetTonnage?: number;
    receivedTonnage?: number;
    remainingTonnage?: number;
    destinationStockpile?: string;
    tolerancePercentage?: number;
    calorieMin?: number;
    existingScheduleCount?: number;
    remainingSlotCount?: number;
  };
  draftRows?: Array<{
    etaDateTime?: string;
    estimatedTonnage?: number;
    estimatedTruckCount?: number;
    remarks?: string;
  }>;
  sameDaySummary?: Array<{
    date?: string;
    existingSchedulesSameDate?: number;
    existingTrucksSameDate?: number;
    existingTonnageSameDate?: number;
    draftRowsSameDate?: number;
    draftTrucksSameDate?: number;
    draftTonnageSameDate?: number;
  }>;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/gemini/schedule-advice', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error:
          'GEMINI_API_KEY belum tersedia di server. Silakan periksa panel Settings > Secrets untuk mengaktifkan Saran AI.',
      });
      return;
    }

    const body = (req.body || {}) as ScheduleAdviceRequestBody;
    if (!body.po || !body.po.poNumber) {
      res.status(400).json({ error: 'Data Purchase Order (PO) belum dipilih.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const compactContext = {
        poNumber: body.po.poNumber,
        supplier: body.po.supplierName,
        sisaKuotaKg: body.po.remainingTonnage,
        sisaSlot: body.po.remainingSlotCount,
        stockpile: body.po.destinationStockpile,
        draf: body.draftRows?.slice(0, 6),
        kepadatanTanggal: body.sameDaySummary?.slice(0, 6),
      };

      const prompt = [
        'Analisis singkat rencana jadwal pengiriman batubara:',
        JSON.stringify(compactContext),
        'Fokus pada pengiriman 2 rit atau 2 armada terpisah dalam 1 hari (jeda jam tiba pagi/siang, antrean timbangan & stockpile, serta pemenuhan sisa kuota dalam batas 20 slot/PO). Buat maksimal 2 kalimat per bagian dan maksimal 3 poin langkah.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction:
            'Asisten logistik batubara SIMOTUBA. Jawab super ringkas, padat, dan praktis dalam Bahasa Indonesia sesuai JSON skema.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ringkasanStrategi: {
                type: Type.STRING,
                description: 'Maks 2 kalimat: kondisi sisa kuota PO & estimasi rit.',
              },
              rekomendasiDuaRitHarian: {
                type: Type.STRING,
                description:
                  'Maks 2 kalimat: saran jeda jam kedatangan (pagi & siang) untuk 2 rit / 2 armada dalam 1 hari.',
              },
              analisisAntreanDanStockpile: {
                type: Type.STRING,
                description: 'Maks 2 kalimat: potensi antrean timbangan & stockpile.',
              },
              saranAksiCepat: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2-3 poin aksi singkat.',
              },
              usulPembagianBaris: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tanggalEta: {
                      type: Type.STRING,
                      description: 'Format YYYY-MM-DD.',
                    },
                    beratKg: {
                      type: Type.NUMBER,
                      description: 'Berat muatan Kg (misal 30000).',
                    },
                    jumlahArmada: {
                      type: Type.INTEGER,
                      description: '1 rit per baris atau sesuai kebutuhan.',
                    },
                    keterangan: {
                      type: Type.STRING,
                      description: 'Catatan singkat huruf kapital.',
                    },
                  },
                },
                description: 'Maksimal 4 baris jadwal contoh.',
              },
            },
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json({ advice: parsed });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      console.error('Gemini schedule advice error:', err);
      const status = typeof errorObj?.status === 'number' && errorObj.status >= 400 ? errorObj.status : 500;
      res.status(status).json({
        error:
          errorObj?.message ||
          'Gagal menghubungi layanan Gemini AI. Pastikan GEMINI_API_KEY aktif dan coba lagi.',
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIMOTUBA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
