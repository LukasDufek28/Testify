import { useEffect, useRef } from "react";
import ReactECharts, { type EChartsOption } from "echarts-for-react";

export default function ResponsiveResultChart({option,height}:{option:EChartsOption;height:number|string}) {
  const container=useRef<HTMLDivElement>(null);
  const chart=useRef<ReactECharts>(null);
  const resize=()=>{
    const element=container.current,instance=chart.current?.getEchartsInstance();
    if(element&&instance&&(instance.getWidth()!==element.clientWidth||instance.getHeight()!==element.clientHeight)) {
      instance.resize({width:element.clientWidth,height:element.clientHeight});
    }
  };
  useEffect(()=>{
    const element=container.current;
    if(!element)return;
    let frame=0;
    // ResizeObserver also reports charts below the fold, where iframe sensors can lag.
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(resize);});
    observer.observe(element);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  return <div ref={container} style={{height,width:'100%',minWidth:0}}><ReactECharts ref={chart} autoResize={false} onChartReady={resize} style={{height:'100%',width:'100%'}} option={option}/></div>;
}
