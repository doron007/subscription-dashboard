import { pdfjs } from 'react-pdf'; // or direct import?
// pdfjs-dist usage in Node:
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';

// We need to set the worker? In Node we might not need standard worker or can use the one included.
// Actually pdfjs-dist in Node can run without worker if we set disableWorker = true, or point to the worker file.

export async function convertPdfToImagesNode(buffer: Buffer): Promise<string[]> {
    // Set worker?
    // For Node, we often don't strictly need the worker file if we fake it or use legacy build.
    // Let's rely on standard import.

    // Suppress heavy logging
    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        verbosity: 0
    });

    const doc = await loadingTask.promise;
    const images: string[] = [];

    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        await page.render({
            canvasContext: context as any,
            viewport: viewport
        }).promise;

        // Convert to base64 string
        const base64 = canvas.toDataURL('image/png'); // "data:image/png;base64,..."
        images.push(base64);
    }

    return images;
}
