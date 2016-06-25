'use strict';

const imageUploader = require('../libs/image-uploader');
const _ = require('lodash');
const elasticsearch = require('../libs/elasticsearch');

var IGNORE_ATTRIBUTES = [
  'updatedAt',
  'createdAt'
];

var ITEM_STATUS = {
  FOR_SELL: 1,
  NOT_FOR_SELL: 0
};

module.exports = function(sequelize, DataTypes) {
  let Item = sequelize.define('Item', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [1, 50]
      }
    },
    description: {
      type: DataTypes.STRING,
      validate: {
        len: [1, 125]
      }
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: ITEM_STATUS.FOR_SELL
    },
    image: {
      type: DataTypes.STRING
    },
    imageFile: {
      type: DataTypes.JSON
    },
    quantity: {
      type: DataTypes.INTEGER
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    hooks: {
      afterCreate: function(item, options) {
        // Run the index immediately if Item is for sell
        if (item.status === ITEM_STATUS.FOR_SELL) return elasticsearch.indexShopById(item.shopId);
      },
      afterUpdate: function(item, options) {
        return elasticsearch.indexShopById(item.shopId);
      },
      afterDestroy: function(item, options) {
        let promises = [];

        if (item.imageFile && _.isArray(item.imageFile.versions)) {
          promises[promises.length] = imageUploader.deleteImages(item.imageFile.versions);
        }

        promises[promises.length] = elasticsearch.indexShopById(item.shopId);

        return Promise.all(promises);
      }
    },
    classMethods: {
      associate: function(models) {
        Item.belongsTo(models.Shop, {
          foreignKey: 'shopId'
        });
        Item.belongsTo(models.Category, {
          foreignKey: 'categoryId'
        });
      }
    },
    instanceMethods: {
      toJSON: function () {
        var values = this.get();
        
        IGNORE_ATTRIBUTES.forEach(attr => {
          delete values[attr];
        });
        
        return values;
      }
    }
  });
  
  Item.MAXIMUM_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB
  
  Item.STATUS = ITEM_STATUS;

  return Item;
};
