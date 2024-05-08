import {memoize} from '../misc/memoize.js';
import {parseRegex} from './parseRegex.js';
import {toNFA} from './toNFA.js';

const compileRegex = memoize((pattern) => toNFA(parseRegex(pattern)));

const input = document.querySelector('input');

const update = () => {
  const data = compileRegex(input.value);

  const nodes = Array.from(
    new Set(data.flatMap(({from, to}) => [from, to]))
  ).map((id) => ({id}));

  const links = data.map((d) => ({
    source: d.from,
    target: d.to,
    label: d.label,
  }));

  const {d3} = window;
  const svg = d3.select('svg');
  const width = +svg.attr('width');
  const height = +svg.attr('height');

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3.forceLink(links).id((d) => d.id)
    )
    .force('charge', d3.forceManyBody())
    .force('center', d3.forceCenter(width / 2, height / 2));

  // arrow markers
  svg
    .append('defs')
    .selectAll('marker')
    .data(['end']) // Different link/path types can be defined here
    .enter()
    .append('marker')
    .attr('id', String)
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 15) // Controls the distance between the node and the arrow
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5');

  // lines
  const link = svg
    .append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .style('stroke', 'gray')
    .attr('marker-end', 'url(#end)'); // Use the marker

  // Draw nodes
  const node = svg
    .append('g')
    .attr('class', 'nodes')
    .selectAll('circle')
    .data(nodes)
    .enter()
    .append('circle')
    .attr('r', 5);

  // Drag functionality
  node.call(
    d3
      .drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      })
  );

  const nodeLabels = svg
    .append('g')
    .attr('class', 'labels')
    .selectAll('text')
    .data(nodes)
    .enter()
    .append('text')
    .attr('dx', 12)
    .attr('dy', '.35em')
    .text((d) => d.id);

  const linkLabels = svg
    .append('g')
    .attr('class', 'link-labels')
    .selectAll('text')
    .data(links)
    .enter()
    .append('text')
    .style('fill', 'black') // Make sure the color contrasts with the background
    .attr('font-size', 12)
    .text((d) => d.label);

  simulation.nodes(nodes).on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);

    nodeLabels.attr('x', (d) => d.x).attr('y', (d) => d.y);

    linkLabels
      .attr('x', (d) => (d.source.x + d.target.x) / 2)
      .attr('y', (d) => (d.source.y + d.target.y) / 2);
  });

  simulation.force('link').links(links);
};

input.addEventListener('input', update);

update();
