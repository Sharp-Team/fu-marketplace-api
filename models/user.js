'use strict';

const Promise = require('bluebird');
const bcrypt = Promise.promisifyAll(require('bcrypt'));

const saltRound = parseInt(process.env.PASSWORD_SALT_ROUND);
const hashPassword = (password) => {
  return bcrypt.hashAsync(password, saltRound);
};

var IGNORE_ATTRIBUTES = ['password', 'updatedAt', 'createdAt', 'seller', 'admin', 'acceptTokenAfter'];

module.exports = function(sequelize, DataTypes) {
  let User = sequelize.define('User', {
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    seller: {
      type: DataTypes.BOOLEAN
    },
    admin: {
      type: DataTypes.BOOLEAN
    },
    acceptTokenAfter: {
      type: DataTypes.DATE
    }
  }, {
    hooks: {
      beforeCreate: function(user, options) {
        return hashPassword(user.password).then(hashedPassword => {
          user.password = hashedPassword;
        });
      },
      beforeUpdate: function(user, options) {
        if (!user.changed('password')) return;
        return hashPassword(user.password).then(hashedPassword => {
          user.password = hashedPassword;
        });
      }
    },
    classMethods: {
      associate: function(models) {
        // associations can be defined here
      }
    },
    instanceMethods: {
      toJSON: function () {
        var values = this.get();
        IGNORE_ATTRIBUTES.forEach(attr => {
          delete values[attr];
        });
        return values;
      },
      verifyPassword: function(inputPassword) {
        return bcrypt.compareAsync(inputPassword, this.password);
      },
      signOutAll: function() {
        return this.update({acceptTokenAfter: new Date()});
      }
    }
  });
  return User;
};
