// @ts-check
const params = JSON.parse(process.env.PARAMS || 'FAIL');

const storageByte = '20000000';
const ix = params.beans_per_unit.findIndex(({ key }) => key === 'storageByte');
params.beans_per_unit[ix].beans = storageByte;

const paramChange = {
  title: 'Lower Bundle Cost to 0.02 IST/Kb (a la mainnet 61)',
  description: '0.02 IST/Kb',
  deposit: '10000000ubld',
  changes: [
    {
      subspace: 'swingset',
      key: 'beans_per_unit',
      value: '...',
    },
  ],
};
paramChange.changes[0].value = params.beans_per_unit;
console.log(JSON.stringify(paramChange, null, 2));
