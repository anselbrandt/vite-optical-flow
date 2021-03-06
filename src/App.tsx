import { GPU } from "gpu.js";
import { ChangeEventHandler, useEffect, useRef, useState } from "react";
import Controls from "./components/controls";
import Legend from "./components/legend";
import { getDirectionalColor } from "./utils";
import { generateZones, kernelFunction } from "./utils/flow";
// import * as d3 from 'd3'

function App() {
  const [video, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [canvas, setCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const timestamp = useRef<number>(0);
  const lastPixels = useRef<Uint8ClampedArray>();
  const [size, setSize] = useState({ width: 640, height: 480 });
  const qualityRef = useRef(10);
  const [quality, setQuality] = useState(10);
  const transparencyRef = useRef(1);
  const [transparency, setTransparency] = useState(1);
  const maxFlowRef = useRef(100);
  const [maxFlow, setMaxFlow] = useState(100);
  const minFlowRef = useRef(0);
  const [minFlow, setMinFlow] = useState(0);
  const monochromeRef = useRef(false);
  const [monochrome, setMonochrome] = useState(false);
  const histogramRef = useRef(true);
  const [histogram, setHistogram] = useState(true);
  const zonesRef = useRef<Float32Array[]>();
  const [zonesLength, setZonesLength] = useState<number>();

  const handleQuality: ChangeEventHandler<HTMLInputElement> = (event) => {
    qualityRef.current = +event.target.value;
    setQuality(+event.target.value);
  };

  const handleMaxFlow: ChangeEventHandler<HTMLInputElement> = (event) => {
    maxFlowRef.current = +event.target.value;
    setMaxFlow(+event.target.value);
  };

  const handleMinFlow: ChangeEventHandler<HTMLInputElement> = (event) => {
    minFlowRef.current = +event.target.value;
    setMinFlow(+event.target.value);
  };

  const handleTransparency: ChangeEventHandler<HTMLInputElement> = (event) => {
    transparencyRef.current = +event.target.value / 100;
    setTransparency(+event.target.value / 100);
  };

  const handleMonochrome = () => {
    monochromeRef.current = !monochrome;
    setMonochrome(!monochrome);
  };
  const handleHistogram = () => {
    histogramRef.current = !histogram;
    setHistogram(!histogram);
  };

  useEffect(() => {
    if (!video) return;
    if (!canvas) return;

    zonesRef.current = generateZones(
      size.width,
      size.height,
      qualityRef.current
    );

    setZonesLength(zonesRef.current.length);

    const gpu = new GPU({});

    const render = (current: number) => {
      if (!zonesRef.current) return;

      timestamp.current = current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");

      context?.drawImage(
        video,
        0,
        0,
        video.videoWidth,
        video.videoHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const image = context?.getImageData(0, 0, canvas.width, canvas.height);

      const pixels = image?.data;

      if (pixels && lastPixels.current && context) {
        const kernel = gpu
          .createKernel(kernelFunction as any)
          .setOutput([zonesRef.current.length])
          .setTactic("balanced");

        const flow = kernel(
          lastPixels.current,
          pixels,
          zonesRef.current,
          quality,
          canvas.width
        ) as [];

        context.beginPath();
        context.rect(0, 0, canvas.width, canvas.height);
        context.fillStyle = `rgba(0, 0, 0, ${transparencyRef.current})`;
        context.fill();

        let scalers = Array(size.width).fill(0);

        for (let i = 0; i < flow.length; i++) {
          const zone = flow[i];
          const x = zone[0];
          const y = zone[1];
          const u = zone[2];
          const v = zone[3];
          const scaler = Math.sqrt(u * u + v * v);

          if (scaler < maxFlowRef.current && scaler > minFlowRef.current) {
            if (monochromeRef.current === true) {
              context.strokeStyle = "#FF6347";
            } else {
              context.strokeStyle = getDirectionalColor(u, v);
            }

            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x - u, y + v);
            context.stroke();
          }

          // filter min/max flow values
          if (histogramRef.current === true) {
            const index = +(
              (canvas.width / (maxFlowRef.current - minFlowRef.current)) *
                scaler -
              canvas.width / (maxFlowRef.current - minFlowRef.current)
            ).toFixed(0);
            scalers[index] = scalers[index] + 1;
            // draw histogram
            context.strokeStyle = "#FF6347";
            context.beginPath();
            context.moveTo(index, canvas.height);
            context.lineTo(index, canvas.height - scalers[index]);
            context.stroke();
          }
          // end histogram
        }
        // draw histogram comment out below for out of loop or d3 draw
        // const data = scalers
        //   .filter((v) => typeof v === "number")
        //   .map((v, i) => [i, size.height - v]) as [number, number][];

        // draw to canvas out of loop
        // for (let point of data) {
        //   if (point) {
        //     const [index, value] = point;
        //     context.strokeStyle = "#FF6347";
        //     context.beginPath();
        //     context.moveTo(index, canvas.height);
        //     context.lineTo(index, canvas.height - value);
        //     context.stroke();
        //   }
        // }

        // draw to canvas with d3
        // if (data) {
        //   const line = d3
        //     .line()
        //     .curve(d3.curveBundle.beta(0.5))
        //     .context(context);
        //   context.strokeStyle = "#FF6347";
        //   context.beginPath();
        //   line(data);
        //   context.stroke();
        // }

        // cleanup
        gpu.destroy();
        kernel.destroy();
      }
      lastPixels.current = pixels;

      requestAnimationFrame(render);
    };

    video.addEventListener("loadeddata", () => {
      requestAnimationFrame(render);
    });
    return () => {
      video.removeEventListener("loadeddata", () => {
        cancelAnimationFrame(timestamp.current);
      });
    };
  }, [
    video,
    canvas,
    size,
    quality,
    minFlow,
    maxFlow,
    transparency,
    monochrome,
    histogram,
  ]);

  return (
    <div className="w-screen mt-10 flex flex-col items-center justify-center">
      <div>
        <video
          ref={setVideoRef}
          id="video"
          src="/test.mp4"
          autoPlay
          loop
          muted
          playsInline
          controls
        />
      </div>
      <div>
        <canvas ref={setCanvasRef} />
      </div>
      <div className="m-4">Flow Points {zonesLength}</div>
      <div className="flex">
        <Controls
          quality={quality}
          maxFlow={maxFlow}
          minFlow={minFlow}
          transparency={transparency}
          monochrome={monochrome}
          histogram={histogram}
          handleQuality={handleQuality}
          handleMaxFlow={handleMaxFlow}
          handleMinFlow={handleMinFlow}
          handleTransparency={handleTransparency}
          handleMonochrome={handleMonochrome}
          handleHistogram={handleHistogram}
        />
        <Legend />
      </div>
    </div>
  );
}

export default App;
