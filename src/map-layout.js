export const mapLayouts = [
  {id:'orthogonal',name:'Ortogonal',algorithm:'layered',direction:'RIGHT'},
  {id:'tree-right',name:'Árbol de izquierda a derecha',algorithm:'mrtree',direction:'RIGHT'},
  {id:'tree-down',name:'Árbol de arriba hacia abajo',algorithm:'mrtree',direction:'DOWN'},
  {id:'layered-down',name:'Capas verticales',algorithm:'layered',direction:'DOWN'},
  {id:'radial',name:'Radial',algorithm:'radial',direction:'RIGHT'},
];
export const mapNodes = p => [...p.categories, ...p.codes];
export const mapEdges = p => [
  ...p.codes.filter(c => c.categoryId).map(c => ({id:`cat-${c.id}`,source:c.id,target:c.categoryId,type:'es parte de',structural:true})),
  ...p.codes.filter(c => c.parentId).map(c => ({id:`parent-${c.id}`,source:c.id,target:c.parentId,type:'es subcódigo de',structural:true})),
  ...p.relations,
];
export const mapSignature = p => JSON.stringify({nodes:mapNodes(p).map(n => [n.id,n.name]),edges:mapEdges(p).map(r => [r.id,r.source,r.target,r.type])});
let enginePromise;
export async function autoLayout(p, mode) {
  const preset = mapLayouts.find(layout => layout.id === mode);
  if (!preset) throw new Error('Selecciona una organización de mapa válida.');
  const nodes = mapNodes(p), edges = mapEdges(p);
  if (!nodes.length) throw new Error('Crea códigos o categorías antes de organizar el mapa.');
  enginePromise ||= import('elkjs/lib/elk.bundled.js').then(module => new module.default());
  const engine = await enginePromise;
  const result = await engine.layout({
    id:'root',
    layoutOptions:{
      'elk.algorithm':preset.algorithm,
      'elk.direction':preset.direction,
      'elk.edgeRouting':mode === 'radial' ? 'POLYLINE' : 'ORTHOGONAL',
      'elk.padding':'[top=60,left=60,bottom=60,right=60]',
      'elk.spacing.nodeNode':'85',
      'elk.layered.spacing.nodeNodeBetweenLayers':'160',
      'elk.spacing.edgeNode':'35',
      'elk.separateConnectedComponents':'true',
      'elk.randomSeed':'1',
    },
    children:nodes.map(n => ({id:n.id,width:280,height:100})),
    edges:edges.map(edge => ({id:edge.id,sources:[edge.structural ? edge.target : edge.source],targets:[edge.structural ? edge.source : edge.target],labels:[{id:`label-${edge.id}`,text:edge.type,width:Math.min(720,Math.max(110,edge.type.length * 7)),height:24}]})),
  });
  const positions = Object.fromEntries(result.children.map(node => [node.id,{x:node.x,y:node.y}]));
  for (const pos of Object.values(positions)) if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || pos.x < 0 || pos.y < 0 || pos.x > 100000 || pos.y > 100000) throw new Error('El mapa excede el tamaño admitido. Divide el análisis.');
  const routes = {};
  for (const edge of result.edges || []) {
    if (!edge.sections?.length) continue;
    const section = edge.sections[0];
    const points = [section.startPoint,...(section.bendPoints || []),section.endPoint].map(point => ({x:point.x,y:point.y}));
    if (edges.find(original => original.id === edge.id).structural) points.reverse();
    const label = edge.labels?.[0];
    routes[edge.id] = {points,...(Number.isFinite(label?.x) && Number.isFinite(label?.y) ? {label:{x:label.x + label.width / 2,y:label.y + label.height / 2}} : {})};
  }
  return {positions,mapLayout:{mode,routing:mode === 'radial' ? 'straight' : 'orthogonal',routes}};
}
export function edgeGeometry(source, target, routing, savedRoute) {
  let points = savedRoute?.points;
  if (!points?.length) {
    const sourceX = source.x + 140, sourceY = source.y + 50;
    const targetX = target.x + 140, targetY = target.y + 50;
    const deltaX = targetX - sourceX, deltaY = targetY - sourceY;
    if (routing === 'orthogonal') {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        const startX = sourceX + (deltaX >= 0 ? 140 : -140), endX = targetX - (deltaX >= 0 ? 140 : -140);
        const middleX = (startX + endX) / 2;
        points = [{x:startX,y:sourceY},{x:middleX,y:sourceY},{x:middleX,y:targetY},{x:endX,y:targetY}];
      } else {
        const startY = sourceY + (deltaY >= 0 ? 50 : -50), endY = targetY - (deltaY >= 0 ? 50 : -50);
        const middleY = (startY + endY) / 2;
        points = [{x:sourceX,y:startY},{x:sourceX,y:middleY},{x:targetX,y:middleY},{x:targetX,y:endY}];
      }
    } else {
      const factor = 1 / Math.max(Math.abs(deltaX) / 145,Math.abs(deltaY) / 55,1);
      points = [{x:sourceX + deltaX * factor,y:sourceY + deltaY * factor},{x:targetX - deltaX * factor,y:targetY - deltaY * factor}];
    }
  }
  const lengths = points.slice(1).map((point,index) => Math.hypot(point.x - points[index].x,point.y - points[index].y));
  let remaining = lengths.reduce((sum,length) => sum + length,0) / 2;
  let label = savedRoute?.label;
  for (let index = 0; !label && index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const ratio = lengths[index] ? remaining / lengths[index] : 0;
      label = {x:points[index].x + (points[index + 1].x - points[index].x) * ratio,y:points[index].y + (points[index + 1].y - points[index].y) * ratio - 10};
    } else remaining -= lengths[index];
  }
  return {path:points.map((point,index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),label:label || points[0]};
}