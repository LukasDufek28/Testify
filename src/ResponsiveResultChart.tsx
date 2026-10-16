import {getDisplayTimezone} from './RunDefaults';
import { useEffect, useMemo, useRef } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import ReactECharts, { type EChartsOption } from "echarts-for-react";

export default function ResponsiveResultChart({option,height}:{option:EChartsOption;height:number|string}) {
  const container=useRef<HTMLDivElement>(null);
  const chart=useRef<ReactECharts>(null);
  const readyInstance=useRef<ReturnType<ReactECharts['getEchartsInstance']>|null>(null);
  const reduced=useReducedMotion();
  const animations=useRef<AnimationPlaybackControls[]>([]);
  const previousValues=useRef(new Map<string,number>());
  const cursorTime=useRef<number|null>(null);
  const lastPointer=useRef<{x:number;y:number}|null>(null);
  const detach=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>{readyInstance.current=null;animations.current.forEach(animation=>animation.stop());detach.current?.();},[]);
  const animatedOption=useMemo(()=>{
    const original=Array.isArray(option.tooltip)?option.tooltip[0]:option.tooltip;
    if(!original)return {...option,animation:!reduced};
    return {...option,animation:!reduced,tooltip:{...original,confine:true,alwaysShowContent:true,axisPointer:{type:'line',snap:false},transitionDuration:reduced?0:.18,
      backgroundColor:'#292832',borderColor:'#36353f',textStyle:{color:'#f9f9fa'},
      formatter:(input:unknown)=>{
        animations.current.forEach(animation=>animation.stop());animations.current=[];
        const params=(Array.isArray(input)?input:[input]) as {seriesName?:string;axisValueLabel?:string;value?:unknown;color?:unknown;seriesId?:string;seriesIndex?:number}[];
        const root=document.createElement('div');root.className='result-motion-tooltip';
        const title=document.createElement('div');title.textContent=cursorTime.current===null ? params[0]?.axisValueLabel??'' : new Date(cursorTime.current).toLocaleString('en-GB',{timeZone:getDisplayTimezone(),day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});root.append(title);
        for(const [index,param] of params.entries()){
          let value=Number(Array.isArray(param.value)?param.value[1]:param.value);
          // Interpolate the displayed annotation between stored points; series data stays intact.
          const series=Array.isArray(option.series)?option.series:[option.series];
          const line=series[param.seriesIndex??index];
          const points=line&&'data' in line&&Array.isArray(line.data)?line.data:[];
          const point=(i:number)=>{const item=points[i];return Array.isArray(item)?item:[];};
          const t=cursorTime.current;
          if(t!==null&&points.length>1) {
            let lo=0,hi=points.length-1;
            while(lo+1<hi){const mid=(lo+hi)>>1;if(Number(point(mid)[0])<=t)lo=mid;else hi=mid;}
            const a=point(lo),b=point(hi),start=Number(a[0]),end=Number(b[0]);
            if(Number.isFinite(start)&&end>start&&Number.isFinite(Number(a[1]))&&Number.isFinite(Number(b[1])))value=Number(a[1])+(Number(b[1])-Number(a[1]))*Math.max(0,Math.min(1,(t-start)/(end-start)));
          }
          if(!Number.isFinite(value))continue;
          const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;margin-top:6px';
          const dot=document.createElement('i');dot.style.cssText='width:6px;height:6px;border-radius:50%;background:#91f5ab';
          if(typeof param.color==='string')dot.style.background=param.color;
          const name=document.createElement('span');name.textContent=param.seriesName??'';
          const number=document.createElement('strong');number.style.fontVariantNumeric='tabular-nums';
          const format=(v:number)=>typeof original.valueFormatter==='function'?String(original.valueFormatter(v,index)):v.toLocaleString('en-US',{maximumFractionDigits:2});
          const key=param.seriesId??param.seriesName??String(index),previous=previousValues.current.get(key)??value;
          number.textContent=format(reduced?value:previous);
          previousValues.current.set(key,value);
          if(!reduced&&previous!==value)animations.current.push(animate(previous,value,{duration:.22,ease:'easeOut',onUpdate:v=>{number.textContent=format(v);}}));
          row.append(dot,name,number);root.append(row);
        }
        return root;
      }
    }};
  },[option,reduced]);
  const resize=()=>{
    const element=container.current,instance=readyInstance.current;
    if(element&&instance&&!instance.isDisposed()&&(instance.getWidth()!==element.clientWidth||instance.getHeight()!==element.clientHeight)) {
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
  return <div ref={container} style={{height,width:'100%',minWidth:0}} onPointerMoveCapture={event=>{
    // The React wrapper briefly exposes an unconfigured measurement instance.
    // Pointer conversion is safe only after onChartReady has supplied the real chart.
    const instance=readyInstance.current,box=container.current?.getBoundingClientRect();
    if(!instance||instance.isDisposed()||!box)return;
    const x=event.clientX-box.left,y=event.clientY-box.top;
    if(!instance.containPixel({gridIndex:0},[x,y]))return;
    const timestamp=Number(instance.convertFromPixel({xAxisIndex:0},x));
    if(Number.isFinite(timestamp)){cursorTime.current=timestamp;lastPointer.current={x,y};}
  }}><ReactECharts ref={chart} autoResize={false} onChartReady={instance=>{
    readyInstance.current=instance;resize();detach.current?.();
    const zr=instance.getZr();
    const retain=()=>{if(!instance.isDisposed()&&lastPointer.current){const {x,y}=lastPointer.current;instance.dispatchAction({type:'updateAxisPointer',currTrigger:'mousemove',x,y});instance.dispatchAction({type:'showTip',x,y});}};
    zr.on('globalout',retain);detach.current=()=>{if(!instance.isDisposed())zr.off('globalout',retain);};
  }} style={{height:'100%',width:'100%'}} option={animatedOption}/></div>;
}
