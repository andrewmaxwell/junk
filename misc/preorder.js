function preorderTraversal(node) {
  if (!node) return [];
  return [
    node.val,
    ...preorderTraversal(node.left),
    ...preorderTraversal(node.right),
  ];
}
