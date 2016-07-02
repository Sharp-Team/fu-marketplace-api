'use strict';

const helper = require('../helper');
const Shop = require('../../models').Shop;
const Review = require('../../models').Review;
const rewire = require('rewire');
const _ = require('lodash');
const fs = require('fs-extra');
const sinon = require('sinon');
const elasticsearch = require('../../libs/elasticsearch');

describe('Shop Model', () => {
  describe('factory', () => {
    it('should be valid', done => {
      let createdShop;
      
      helper.factory.createUserWithRole({}, 'seller').then(u => {
        return helper.factory.createShop({ ownerId: u.id});
      }).then(shop => {
        createdShop = shop;
        expect(shop).to.be.ok;
        return Shop.findById(shop.id);
      }).then(shopFromDb => {
        expect(createdShop.fullname).to.equal(shopFromDb.fullname);
        expect(createdShop.email).to.equal(shopFromDb.email);
        done();
      }, done);
    });
    
    describe('#createShopwithShipPlace', () => {      
      it('should create shop with correct ship places', done => {

        helper.factory.createUserWithRole({}, 'seller').then(u => {
          return helper.factory.createShopWithShipPlace({ ownerId: u.id}, 'dom A');
        }).then(shop => {
          expect(shop).to.be.ok;
          return shop.getShipPlaces();
        }).then(shipPlaces => {
          let shopPlaceNames = _.map(shipPlaces, r => r.name);
          expect(shopPlaceNames).to.include('dom A');
          done();
        });
      });
    });
  });
  
  describe('#toJSON', () => {
    it('should omit IGNORE_ATTRIBUTES in result', done => {
      let IGNORE_ATTRIBUTES = rewire('../../models/shop').__get__('IGNORE_ATTRIBUTES');
      
      Shop.findOne().then(shop => {
        let actualJSON = shop.toJSON();
        IGNORE_ATTRIBUTES.forEach(attribute => {
          expect(actualJSON[attribute]).to.be.undefined;
        });
        done();
      });
    });
  });

  describe('#review', () => {
    describe('with user did not order before', () => {
      let shop;
      beforeEach(done => {
        helper.factory.createShop().then(s => {
          shop = s;
          expect(shop).to.be.ok;
          done();
        });
      });

      it('should return error', done => {
        shop.review({
          userId: 0,
          rate: 3,
          comment: 'xxx'
        }).catch(err => {
          expect(err.status).to.equal(404);
          expect(err.type).to.equal('review');
          expect(err.message).to.equal('You must order at this shop at least one time before review');
          return Review.findAll({
            where: {
              userId: 0,
              shopId: shop.id
            }
          });
        }).then(reviews => {
          expect(reviews).to.have.lengthOf(0);
          done();
        }, done);
      });
    });

    describe('with user ordered before', () => {
      let shop, order;
      beforeEach(done => {
        helper.factory.createShop().then(s => {
          shop = s;
          expect(shop).to.be.ok;
          return helper.factory.createOrder({ shopId: shop.id});
        }).then(o => {
          order = o;
          expect(o.shopId).to.equal(shop.id);
          done();
        });
      });
      
      describe('provide rate and comment', () => {
        it('should return lastest review', done => {
          let review;
          shop.review({
            userId: order.userId,
            rate: 3,
            comment: 'xxx'
          }).then(r => {
            review = r;
            expect(r.userId).to.equal(order.userId);
            expect(r.shopId).to.equal(shop.id);
            expect(r.rate).to.equal(3);
            expect(r.comment).to.equal('xxx');
            return shop.review({
              userId: order.userId,
              rate: 1,
              comment: 'yyy'
            });
          }).then(r => {
            expect(r.id).to.equal(review.id);
            expect(r.rate).to.equal(1);
            expect(r.comment).to.equal('yyy');
            done();
          }, done);
        });
      });

      describe('provide comment only', () => {
        it('should return err and review donot change', done => {
          let review;
          shop.review({
            userId: order.userId,
            rate: 3,
            comment: 'xxx'
          }).then(r => {
            review = r;
            expect(r.userId).to.equal(order.userId);
            expect(r.shopId).to.equal(shop.id);
            expect(r.rate).to.equal(3);
            expect(r.comment).to.equal('xxx');
            return shop.review({
              userId: order.userId,
              comment: 'yyy'
            });
          }).catch(err => {
            expect(err.status).to.equal(404);
            expect(err.message).to.equal('Must provide rate and comment when review shop');
            expect(err.type).to.equal('review');
            return Review.findById(review.id);
          }).then(r => {
            expect(r.userId).to.equal(order.userId);
            expect(r.rate).to.equal(3);
            expect(r.comment).to.equal('xxx');
            expect(r.shopId).to.equal(shop.id);
            done();
          }, done);
        });
      });
    });
  });

  describe('hooks', () => {
    describe('afterCreate', () => {
      let shop;
      let elasticsearchSpy;
      beforeEach(done => {
        elasticsearchSpy = sinon.spy(elasticsearch, 'indexShopById');
        helper.factory.createShop({}, 1).then(s => {
          shop = s;
          done();
        });
      });

      afterEach(() => {
        elasticsearch.indexShopById.restore();
      });

      it('should call elasticsearch.indexShopById', done => {
        expect(elasticsearchSpy.withArgs(shop.id).calledOnce).to.be.true;
        done();
      });
    });

    describe('afterUpdate', () => {
      let shop;
      let elasticsearchSpy;
      beforeEach(done => {
        helper.factory.createShop({}, 1).then(s => {
          elasticsearchSpy = sinon.spy(elasticsearch, 'indexShopById');
          shop = s;
          done();
        });
      });

      afterEach(() => {
        elasticsearch.indexShopById.restore();
      });

      it('should call elasticsearch.indexShopById', done => {
        shop.update({name: 'Updated name'}).then(_ => {
          expect(elasticsearchSpy.withArgs(shop.id).calledOnce).to.be.true;
          done();
        });
      });
    });

    describe('afterDestroy', () => {
      let shop;
      let avatarFile = 'public/uploads/shops/avatar.png';
      let coverFile = 'public/uploads/shops/cover.png';
      let checkAvatarFileExist = () => {
        fs.accessSync(avatarFile);
      };
      let checkCoverFileExist = () => {
        fs.accessSync(coverFile);        
      };
      let elasticsearchSpy;
      
      beforeEach(done => {
        fs.ensureFileSync(avatarFile);
        fs.ensureFileSync(coverFile);
        
        helper.factory.createShop({
          avatarFile: {
            versions: [
              {
                Location: 'http://localhost:3000/uploads/shops/avatar.png',
                Key: avatarFile
              }  
            ]
          },
          coverFile: {
            versions: [
              {
                Location: 'http://localhost:3000/uploads/shops/cover.png',
                Key: coverFile
              }  
            ]
          }
        }, 1).then(u => {
          shop = u;
          elasticsearchSpy = sinon.spy(elasticsearch, 'deleteShopIndexById');
          done();
        });
      });

      afterEach(() => {
        elasticsearch.deleteShopIndexById.restore();
      });
      
      it('should delete all user avatar files after user destroyed', done => {
        shop.destroy().then(() => {
          expect(checkAvatarFileExist).to.throw(Error);
          expect(checkCoverFileExist).to.throw(Error);
          done();
        }, done);
      });

      it('should call elasticsearch.deleteShopIndexById', done => {
        shop.destroy().then(() => {
          expect(elasticsearchSpy.withArgs(shop.id).calledOnce).to.be.true;
          done();
        });
      });
    });
  });
});
