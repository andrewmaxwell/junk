export const initialValue = {
  args: [
    {
      args: [
        {args: [], op: 'id', schema: 'TRANS_DETAIL', column: 'PROGRAM_ID'},
        {args: [], op: 'num', value: 8206}
      ],
      op: '='
    },
    {
      args: [
        {args: [], op: 'id', schema: 'TRANS_DETAIL', column: 'ACCOUNT_ID'},
        {args: [], op: 'id', schema: 'CUSTOMER_ACCOUNT', column: 'ACCOUNT_ID'}
      ],
      op: '='
    },
    {
      args: [
        {args: [], op: 'id', schema: 'CUSTOMER_ACCOUNT', column: 'CUSTOMER_ID'},
        {args: [], op: 'id', schema: 'CUSTOMER', column: 'CUSTOMER_ID'}
      ],
      op: '='
    },
    {
      args: [
        {
          args: [
            {
              args: [],
              op: 'id',
              schema: 'TRANS_DETAIL',
              column: 'AGGREGATE_MERCHANT_ID'
            },
            {args: [], op: 'num', value: 12931}
          ],
          op: '!='
        },
        {
          args: [
            {
              args: [
                {
                  args: [],
                  op: 'id',
                  schema: 'TRANS_DETAIL',
                  column: 'MERCH_SHORT_DBA_NAME'
                }
              ],
              op: 'Uppercase'
            },
            {args: [], op: 'text', value: 'PAYPAL'}
          ],
          op: "Doesn't Contain"
        }
      ],
      op: 'OR'
    },
    {
      args: [
        {
          args: [
            {
              args: [],
              op: 'id',
              schema: 'TRANS_DETAIL',
              column: 'MERCHANT_CATEGORY_CODE'
            },
            {
              args: [
                {args: [], op: 'num', value: 5541},
                {args: [], op: 'num', value: 5542},
                {args: [], op: 'num', value: 5411},
                {args: [], op: 'num', value: 5462},
                {args: [], op: 'num', value: 5422},
                {args: [], op: 'num', value: 5499}
              ],
              op: 'list'
            }
          ],
          op: 'IN'
        },
        {
          args: [
            {
              args: [
                {
                  args: [],
                  op: 'id',
                  schema: 'TRANS_DETAIL',
                  column: 'MERCHANT_CATEGORY_CODE'
                }
              ],
              op: 'Uppercase'
            },
            {args: [], op: 'text', value: 'PAYPAL'}
          ],
          op: "Doesn't Contain"
        },
        {
          args: [
            {
              args: [
                {
                  args: [],
                  op: 'id',
                  schema: 'TRANS_DETAIL',
                  column: 'CARDHOLDER_PRESENT_CD'
                },
                {args: [], op: 'num', value: 5}
              ],
              op: '='
            },
            {
              args: [
                {
                  args: [
                    {
                      args: [],
                      op: 'id',
                      schema: 'TRANS_DETAIL',
                      column: 'MCC_CLASSIFICATION_CODE'
                    },
                    {
                      args: [
                        {args: [], op: 'text', value: '6Z'},
                        {args: [], op: 'text', value: '4Z'},
                        {args: [], op: 'text', value: '6D'},
                        {args: [], op: 'text', value: '6E'},
                        {args: [], op: 'text', value: '6B'},
                        {args: [], op: 'text', value: '4K'},
                        {args: [], op: 'text', value: '4C'},
                        {args: [], op: 'text', value: '4G'},
                        {args: [], op: 'text', value: '6C'},
                        {args: [], op: 'text', value: '4L'},
                        {args: [], op: 'text', value: '4J'},
                        {args: [], op: 'text', value: '4I'},
                        {args: [], op: 'text', value: '6A'},
                        {args: [], op: 'text', value: '4B'},
                        {args: [], op: 'text', value: '4A'},
                        {args: [], op: 'text', value: '4D'},
                        {args: [], op: 'text', value: '2D'},
                        {args: [], op: 'text', value: '4E'},
                        {args: [], op: 'text', value: '6F'}
                      ],
                      op: 'list'
                    }
                  ],
                  op: 'IN'
                },
                {
                  args: [
                    {
                      args: [],
                      op: 'id',
                      schema: 'TRANS_DETAIL',
                      column: 'AGGREGATE_MERCHANT_ID'
                    },
                    {
                      args: [
                        {args: [], op: 'num', value: 12959},
                        {args: [], op: 'num', value: 25404},
                        {args: [], op: 'num', value: 25637},
                        {args: [], op: 'num', value: 24043}
                      ],
                      op: 'list'
                    }
                  ],
                  op: 'IN'
                }
              ],
              op: 'OR'
            }
          ],
          op: 'AND'
        }
      ],
      op: 'OR'
    },
    {
      args: [
        {
          args: [],
          op: 'id',
          schema: 'TRANS_DETAIL',
          column: 'TRANSACTION_DATE'
        },
        {
          args: [
            {
              args: [
                {
                  args: [],
                  op: 'id',
                  schema: 'CUSTOMER_ACCOUNT',
                  column: 'ACTIVE_DATE'
                }
              ],
              op: 'TRUNC'
            },
            {args: [], op: 'num', value: 105},
            {args: [], op: 'num', value: 0.99999}
          ],
          op: '+'
        }
      ],
      op: '<='
    },
    {
      args: [
        {
          args: [
            {
              args: [],
              op: 'id',
              schema: 'CUSTOMER_ACCOUNT',
              column: 'USER_DEFINED2'
            },
            {args: [], op: 'text', value: ''}
          ],
          op: 'NVL'
        },
        {args: [], op: 'text', value: 'O'}
      ],
      op: '!='
    },
    {
      args: [
        {
          args: [
            {args: [], op: 'id', schema: 'CUSTOMER', column: 'EMP_SW'},
            {args: [], op: 'text', value: ''}
          ],
          op: 'NVL'
        },
        {args: [], op: 'text', value: 'Y'}
      ],
      op: '!='
    },
    {
      args: [
        {
          args: [],
          op: 'id',
          schema: 'TRANS_DETAIL',
          column: 'TRANSACTION_TYPE'
        },
        {
          args: [
            {args: [], op: 'text', value: 5},
            {args: [], op: 'text', value: '6'}
          ],
          op: 'list'
        }
      ],
      op: 'IN'
    }
  ],
  op: 'AND'
};
